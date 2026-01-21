"use strict";

const { Client } = require("@modelcontextprotocol/sdk/client");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

function getArgValue(flag) {
	const index = process.argv.indexOf(flag);
	if (index === -1 || index + 1 >= process.argv.length) {
		return null;
	}
	return process.argv[index + 1];
}

function hasFlag(flag) {
	return process.argv.includes(flag);
}

function buildRis(title) {
	return [
		"TY  - JOUR",
		`TI  - ${title}`,
		"AU  - Doe, Jane",
		"PY  - 2020",
		"JO  - Example Journal",
		"ER  -"
	].join("\n");
}

async function main() {
	const target = getArgValue("--target") || process.env.ZOTERO_TARGET || "connector";
	const title = getArgValue("--title") || process.env.TEST_ITEM_TITLE || "Connector Save Test";
	const skipSave = hasFlag("--no-save");

	const transport = new StdioClientTransport({
		command: "node",
		args: ["mcp/server.js"],
		cwd: process.cwd(),
		env: process.env
	});
	const client = new Client({ name: "mcp-test", version: "0.1.0" });
	await client.connect(transport);

	const importRes = await client.callTool({
		name: "translate_import",
		arguments: {
			data: buildRis(title),
			mimeType: "text/plain"
		}
	});
	const items = JSON.parse(importRes.content[0].text).items;

	if (skipSave) {
		console.log("translate_import ok; skipping save (use without --no-save to store items)");
		await client.close();
		return;
	}

	const saveRes = await client.callTool({
		name: "save_to_zotero",
		arguments: { target, items }
	});
	console.log(saveRes.content[0].text);

	await client.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
