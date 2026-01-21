"use strict";

const request = require("request-promise-native");

const DEFAULT_BASE_URL = process.env.ZOTERO_CONNECTOR_URL || "http://127.0.0.1:23119";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.ZOTERO_REQUEST_TIMEOUT_MS || "15000", 10);
const CONNECTOR_API_VERSION = parseInt(process.env.ZOTERO_CONNECTOR_API_VERSION || "3", 10);
const DEFAULT_CLIENT_VERSION = process.env.ZOTERO_CONNECTOR_CLIENT_VERSION || "translation-server-mcp";

function toUrl(path) {
	return new URL(path, DEFAULT_BASE_URL).toString();
}

function buildPayload(items, options) {
	const payload = {
		items
	};
	if (options && options.sessionID) {
		payload.sessionID = options.sessionID;
	}
	if (options && options.uri) {
		payload.uri = options.uri;
	}
	if (options && options.cookie) {
		payload.cookie = options.cookie;
	}
	if (options && options.detailedCookies) {
		payload.detailedCookies = options.detailedCookies;
	}
	if (options && options.proxy) {
		payload.proxy = options.proxy;
	}
	return payload;
}

async function save(items, options) {
	const payloadItems = Array.isArray(items) ? items : [items];
	const payload = buildPayload(payloadItems, options);
	const response = await request({
		method: "POST",
		uri: toUrl("/connector/saveItems"),
		body: payload,
		headers: {
			"Content-Type": "application/json",
			"X-Zotero-Connector-API-Version": String(CONNECTOR_API_VERSION),
			"X-Zotero-Version": (options && options.clientVersion) || DEFAULT_CLIENT_VERSION
		},
		json: true,
		timeout: DEFAULT_TIMEOUT_MS,
		simple: false,
		resolveWithFullResponse: true
	});
	if (response.statusCode >= 400) {
		const detail = typeof response.body === "string" ? response.body : JSON.stringify(response.body);
		throw new Error(`zotero connector save failed (${response.statusCode}): ${detail}`);
	}
	return {
		statusCode: response.statusCode,
		response: response.body
	};
}

module.exports = {
	save
};
