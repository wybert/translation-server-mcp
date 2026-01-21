"use strict";

const request = require("request-promise-native");

const DEFAULT_BASE_URL = process.env.TRANSLATION_SERVER_URL || "http://127.0.0.1:1969";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.TRANSLATION_SERVER_TIMEOUT_MS || "15000", 10);

function toUrl(pathOrUrl) {
	if (/^https?:\/\//i.test(pathOrUrl)) {
		return pathOrUrl;
	}
	return new URL(pathOrUrl, DEFAULT_BASE_URL).toString();
}

function parseJsonMaybe(body) {
	if (body === null || body === undefined) {
		return body;
	}
	if (typeof body !== "string") {
		return body;
	}
	try {
		return JSON.parse(body);
	} catch (err) {
		return body;
	}
}

function ensureOk(response, label) {
	if (response.statusCode >= 400) {
		const body = parseJsonMaybe(response.body);
		const detail = typeof body === "string" ? body : JSON.stringify(body);
		throw new Error(`${label} failed (${response.statusCode}): ${detail}`);
	}
}

async function postText(pathOrUrl, body, headers) {
	return request({
		method: "POST",
		uri: toUrl(pathOrUrl),
		body,
		headers: Object.assign({ "Content-Type": "text/plain" }, headers || {}),
		timeout: DEFAULT_TIMEOUT_MS,
		simple: false,
		resolveWithFullResponse: true
	});
}

async function postJson(pathOrUrl, payload, headers) {
	return request({
		method: "POST",
		uri: toUrl(pathOrUrl),
		body: payload,
		headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
		json: true,
		timeout: DEFAULT_TIMEOUT_MS,
		simple: false,
		resolveWithFullResponse: true
	});
}

async function translateWeb(targetUrl) {
	if (!targetUrl) {
		throw new Error("translate_web requires a url");
	}
	const response = await postText("/web", targetUrl);
	if (response.statusCode === 300) {
		const data = parseJsonMaybe(response.body) || {};
		return {
			status: "multiple_choices",
			url: data.url || targetUrl,
			session: data.session,
			items: data.items
		};
	}
	ensureOk(response, "translate_web");
	return {
		status: "ok",
		items: parseJsonMaybe(response.body)
	};
}

async function translateWebSelect(options) {
	if (!options || !options.session || !options.items) {
		throw new Error("translate_web_select requires session and items");
	}
	const payload = {
		session: options.session,
		items: options.items
	};
	if (options.url) {
		payload.url = options.url;
	}
	const response = await postJson("/web", payload);
	ensureOk(response, "translate_web_select");
	return {
		status: "ok",
		items: response.body
	};
}

async function translateSearch(identifier) {
	if (!identifier) {
		throw new Error("translate_search requires an identifier");
	}
	const response = await postText("/search", identifier);
	ensureOk(response, "translate_search");
	return {
		status: "ok",
		items: parseJsonMaybe(response.body)
	};
}

async function translateImport(options) {
	if (!options || typeof options.data !== "string") {
		throw new Error("translate_import requires data (string)");
	}
	const mimeType = options.mimeType || "text/plain";
	const response = await postText("/import", options.data, { "Content-Type": mimeType });
	ensureOk(response, "translate_import");
	return {
		status: "ok",
		items: parseJsonMaybe(response.body)
	};
}

async function exportItems(options) {
	if (!options || !options.format) {
		throw new Error("export_items requires format");
	}
	const url = new URL("/export", DEFAULT_BASE_URL);
	url.searchParams.set("format", options.format);
	const payload = JSON.stringify(options.items || []);
	const response = await postText(url.toString(), payload, { "Content-Type": "application/json" });
	ensureOk(response, "export_items");
	return {
		status: "ok",
		output: response.body
	};
}

module.exports = {
	translateWeb,
	translateWebSelect,
	translateSearch,
	translateImport,
	exportItems
};
