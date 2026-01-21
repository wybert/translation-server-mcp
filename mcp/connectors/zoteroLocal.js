"use strict";

const request = require("request-promise-native");

const DEFAULT_BASE_URL = process.env.ZOTERO_LOCAL_API_URL || "http://127.0.0.1:23119";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.ZOTERO_REQUEST_TIMEOUT_MS || "15000", 10);

function toUrl(path) {
	return new URL(path, DEFAULT_BASE_URL).toString();
}

function applyCollection(items, collectionKey) {
	if (!collectionKey) {
		return items;
	}
	return items.map((item) => {
		const updated = Object.assign({}, item);
		const collections = Array.isArray(item.collections) ? item.collections.slice() : [];
		if (!collections.includes(collectionKey)) {
			collections.push(collectionKey);
		}
		updated.collections = collections;
		return updated;
	});
}

async function save(items, options) {
	const apiKey = process.env.ZOTERO_LOCAL_API_KEY;
	if (!apiKey) {
		throw new Error("ZOTERO_LOCAL_API_KEY is required for Zotero local API");
	}
	const libraryType = (options && options.libraryType) || "users";
	const libraryId = (options && options.libraryId) || "0";
	const collectionKey = options && options.collectionKey;
	const payloadItems = Array.isArray(items) ? items : [items];
	const body = applyCollection(payloadItems, collectionKey);
	const response = await request({
		method: "POST",
		uri: toUrl(`/${libraryType}/${libraryId}/items`),
		body,
		headers: {
			"Zotero-API-Key": apiKey,
			"Zotero-API-Version": "3",
			"Content-Type": "application/json"
		},
		json: true,
		timeout: DEFAULT_TIMEOUT_MS,
		simple: false,
		resolveWithFullResponse: true
	});
	if (response.statusCode >= 400) {
		const detail = typeof response.body === "string" ? response.body : JSON.stringify(response.body);
		throw new Error(`zotero local save failed (${response.statusCode}): ${detail}`);
	}
	return {
		statusCode: response.statusCode,
		response: response.body
	};
}

module.exports = {
	save
};
