"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const translationClient = require("./translationClient");
const zoteroLocal = require("./connectors/zoteroLocal");
const zoteroWeb = require("./connectors/zoteroWeb");
const zoteroConnector = require("./connectors/zoteroConnector");

const server = new Server(
	{ name: "translation-server-mcp", version: "0.1.0" },
	{ capabilities: { tools: {} } }
);

const tools = [
	{
		name: "translate_web",
		description: "Translate a web page URL to Zotero items using the translation server.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string", description: "URL to translate" }
			},
			required: ["url"],
			additionalProperties: false
		}
	},
	{
		name: "translate_web_select",
		description: "Complete a multi-choice web translation by posting the selected items map.",
		inputSchema: {
			type: "object",
			properties: {
				session: { type: "string", description: "Session token from translate_web" },
				items: {
					type: "object",
					description: "Items map from translate_web with unwanted entries removed",
					additionalProperties: true
				},
				url: { type: "string", description: "Original URL (optional)" }
			},
			required: ["session", "items"],
			additionalProperties: false
		}
	},
	{
		name: "translate_search",
		description: "Translate an identifier (DOI, ISBN, PMID, arXiv) to Zotero items.",
		inputSchema: {
			type: "object",
			properties: {
				identifier: { type: "string", description: "Identifier to translate" }
			},
			required: ["identifier"],
			additionalProperties: false
		}
	},
	{
		name: "translate_import",
		description: "Import citation data (RIS/BibTeX/etc.) into Zotero item JSON.",
		inputSchema: {
			type: "object",
			properties: {
				data: { type: "string", description: "Raw import data" },
				mimeType: { type: "string", description: "Override Content-Type (optional)" }
			},
			required: ["data"],
			additionalProperties: false
		}
	},
	{
		name: "export_items",
		description: "Export Zotero item JSON to a bibliographic format (RIS, BibTeX, etc.).",
		inputSchema: {
			type: "object",
			properties: {
				items: { type: ["array", "object"], description: "Zotero item JSON" },
				format: { type: "string", description: "Export format (e.g. bibtex, ris)" }
			},
			required: ["items", "format"],
			additionalProperties: false
		}
	},
	{
		name: "save_to_zotero",
		description: "Save Zotero item JSON to Zotero Desktop (connector/local) or Zotero Web.",
		inputSchema: {
			type: "object",
			properties: {
				items: { type: ["array", "object"], description: "Zotero item JSON" },
				target: {
					type: "string",
					enum: ["connector", "local", "web"],
					description: "Target Zotero API (connector, local, or web)"
				},
				libraryType: { type: "string", description: "users or groups (web only)" },
				libraryId: { type: "string", description: "Library ID (web only)" },
				collectionKey: { type: "string", description: "Optional Zotero collection key" },
				sessionID: { type: "string", description: "Connector session ID (optional)" },
				uri: { type: "string", description: "Source URL for connector cookie sandbox (optional)" },
				cookie: { type: "string", description: "Cookie header value for connector save (optional)" },
				detailedCookies: { type: "string", description: "Detailed cookies for connector save (optional)" },
				proxy: { type: "string", description: "Proxy identifier for connector save (optional)" },
				clientVersion: { type: "string", description: "Connector client version header override" }
			},
			required: ["items"],
			additionalProperties: false
		}
	}
];

function toText(result) {
	if (typeof result === "string") {
		return result;
	}
	return JSON.stringify(result, null, 2);
}

async function handleSaveToZotero(args) {
	if (!args || !args.items) {
		throw new Error("save_to_zotero requires items");
	}
	const target = args.target || "connector";
	const options = {
		libraryType: args.libraryType,
		libraryId: args.libraryId,
		collectionKey: args.collectionKey,
		sessionID: args.sessionID,
		uri: args.uri,
		cookie: args.cookie,
		detailedCookies: args.detailedCookies,
		proxy: args.proxy,
		clientVersion: args.clientVersion
	};
	if (target === "connector") {
		return zoteroConnector.save(args.items, options);
	}
	if (target === "local") {
		return zoteroLocal.save(args.items, options);
	}
	if (target === "web") {
		return zoteroWeb.save(args.items, options);
	}
	throw new Error(`Unknown Zotero target: ${target}`);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const name = request.params.name;
	const args = request.params.arguments || {};
	let result;

	switch (name) {
		case "translate_web":
			result = await translationClient.translateWeb(args.url);
			break;
		case "translate_web_select":
			result = await translationClient.translateWebSelect({
				session: args.session,
				items: args.items,
				url: args.url
			});
			break;
		case "translate_search":
			result = await translationClient.translateSearch(args.identifier);
			break;
		case "translate_import":
			result = await translationClient.translateImport({
				data: args.data,
				mimeType: args.mimeType
			});
			break;
		case "export_items":
			result = await translationClient.exportItems({
				items: args.items,
				format: args.format
			});
			break;
		case "save_to_zotero":
			result = await handleSaveToZotero(args);
			break;
		default:
			throw new Error(`Unknown tool: ${name}`);
	}

	return {
		content: [{ type: "text", text: toText(result) }]
	};
});

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	process.stderr.write(`${err.stack || err}\n`);
	process.exit(1);
});
