"use strict";

const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { spawn, execFileSync } = require("child_process");

const DEFAULT_URL = process.env.TRANSLATION_SERVER_URL || "http://127.0.0.1:1969";
const DEFAULT_HOST = new URL(DEFAULT_URL).hostname;
const DEFAULT_PORT = Number(new URL(DEFAULT_URL).port || 1969);

let childProcess = null;

function isDirPopulated(targetPath) {
	try {
		const stat = fs.statSync(targetPath);
		if (!stat.isDirectory()) return false;
		return fs.readdirSync(targetPath).length > 0;
	} catch (_) {
		return false;
	}
}

function parseGitHubRepo(url) {
	let normalized = url.trim();
	if (normalized.startsWith("git+")) {
		normalized = normalized.slice(4);
	}
	if (normalized.startsWith("git@github.com:")) {
		normalized = normalized.replace("git@github.com:", "https://github.com/");
	}
	normalized = normalized.replace(/\.git$/, "");
	const match = normalized.match(/github\.com\/?([^/]+)\/([^/]+)$/);
	if (!match) {
		throw new Error(`Unsupported submodule URL: ${url}`);
	}
	return { owner: match[1], repo: match[2] };
}

function getTarballUrl(url, commit) {
	const { owner, repo } = parseGitHubRepo(url);
	return `https://codeload.github.com/${owner}/${repo}/tar.gz/${commit}`;
}

function downloadToFile(url, destPath) {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(destPath);
		function request(targetUrl) {
			https.get(targetUrl, (res) => {
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					res.resume();
					request(res.headers.location);
					return;
				}
				if (res.statusCode !== 200) {
					reject(new Error(`Download failed: ${targetUrl} (${res.statusCode})`));
					return;
				}
				res.pipe(file);
				file.on("finish", () => file.close(resolve));
			}).on("error", (err) => {
				reject(err);
			});
		}
		request(url);
	});
}

async function ensureSubmodules() {
	if (process.env.MCP_SKIP_SUBMODULES === "1") {
		return;
	}
	const manifestPath = path.join(__dirname, "submodules.json");
	if (!fs.existsSync(manifestPath)) {
		return;
	}
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	for (const entry of manifest) {
		const target = path.join(process.cwd(), entry.path);
		if (isDirPopulated(target)) {
			continue;
		}
		process.stderr.write(`[mcp] fetching ${entry.path}\n`);
		const tmpFile = path.join(os.tmpdir(), `mcp-submodule-${Date.now()}-${Math.random().toString(16).slice(2)}.tgz`);
		const tarUrl = getTarballUrl(entry.url, entry.commit);
		await downloadToFile(tarUrl, tmpFile);
		try {
			fs.rmSync(target, { recursive: true, force: true });
			fs.mkdirSync(target, { recursive: true });
			execFileSync("tar", ["-xzf", tmpFile, "--strip-components=1", "-C", target]);
		} finally {
			fs.rmSync(tmpFile, { force: true });
		}
	}
}

function waitForPort(host, port, timeoutMs) {
	const start = Date.now();
	return new Promise((resolve, reject) => {
		function tryConnect() {
			const socket = net.connect(port, host);
			socket.on("connect", () => {
				socket.end();
				resolve(true);
			});
			socket.on("error", () => {
				socket.destroy();
				if (Date.now() - start >= timeoutMs) {
					reject(new Error("translation-server did not start"));
					return;
				}
				setTimeout(tryConnect, 300);
			});
		}
		tryConnect();
	});
}

async function ensureTranslationServer() {
	try {
		await waitForPort(DEFAULT_HOST, DEFAULT_PORT, 1000);
		return;
	} catch (_) {
		// not running yet
	}

	childProcess = spawn("node", ["src/server.js"], {
		cwd: process.cwd(),
		env: process.env,
		stdio: ["ignore", "ignore", "inherit"]
	});

	childProcess.on("error", (err) => {
		process.stderr.write(`${err.stack || err}\n`);
	});

	await waitForPort(DEFAULT_HOST, DEFAULT_PORT, 15000);
}

function cleanup() {
	if (childProcess) {
		childProcess.kill("SIGTERM");
		childProcess = null;
	}
}

process.on("SIGINT", () => {
	cleanup();
	process.exit(0);
});
process.on("SIGTERM", () => {
	cleanup();
	process.exit(0);
});
process.on("exit", cleanup);

(async function main() {
	try {
		await ensureSubmodules();
		await ensureTranslationServer();
		require("./server");
	} catch (err) {
		process.stderr.write(`${err.stack || err}\n`);
		cleanup();
		process.exit(1);
	}
})();
