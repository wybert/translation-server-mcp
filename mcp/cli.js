"use strict";

const net = require("net");
const { spawn } = require("child_process");

const DEFAULT_URL = process.env.TRANSLATION_SERVER_URL || "http://127.0.0.1:1969";
const DEFAULT_HOST = new URL(DEFAULT_URL).hostname;
const DEFAULT_PORT = Number(new URL(DEFAULT_URL).port || 1969);

let childProcess = null;

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
		await ensureTranslationServer();
		require("./server");
	} catch (err) {
		process.stderr.write(`${err.stack || err}\n`);
		cleanup();
		process.exit(1);
	}
})();
