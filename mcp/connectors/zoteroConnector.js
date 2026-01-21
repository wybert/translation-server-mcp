"use strict";

const request = require("request-promise-native");
const crypto = require("crypto");

const DEFAULT_BASE_URL = process.env.ZOTERO_CONNECTOR_URL || "http://127.0.0.1:23119";
const DEFAULT_TIMEOUT_MS = parseInt(process.env.ZOTERO_REQUEST_TIMEOUT_MS || "15000", 10);
const CONNECTOR_API_VERSION = parseInt(process.env.ZOTERO_CONNECTOR_API_VERSION || "3", 10);
const DEFAULT_CLIENT_VERSION = process.env.ZOTERO_CONNECTOR_CLIENT_VERSION || "translation-server-mcp";
const DEFAULT_USER_AGENT = process.env.ZOTERO_CONNECTOR_USER_AGENT || "translation-server-mcp";

function toUrl(path) {
	return new URL(path, DEFAULT_BASE_URL).toString();
}

function createSessionId() {
	if (crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return crypto.randomBytes(16).toString("hex");
}

function buildHeaders(options, extra) {
	return Object.assign({
		"X-Zotero-Connector-API-Version": String(CONNECTOR_API_VERSION),
		"X-Zotero-Version": (options && options.clientVersion) || DEFAULT_CLIENT_VERSION
	}, extra || {});
}

function hasNonAscii(str) {
	if (!str) {
		return false;
	}
	for (let i = 0; i < str.length; i++) {
		if (str.charCodeAt(i) > 127) {
			return true;
		}
	}
	return false;
}

function rfc2047Encode(str) {
	if (!str || !hasNonAscii(str)) {
		return str;
	}
	const utf8Bytes = Buffer.from(str, "utf8");
	let encoded = "";
	for (const byte of utf8Bytes) {
		if (byte === 32) {
			encoded += "_";
		}
		else if (byte >= 33 && byte <= 126 && byte !== 61 && byte !== 63 && byte !== 95) {
			encoded += String.fromCharCode(byte);
		}
		else {
			encoded += "=" + byte.toString(16).toUpperCase().padStart(2, "0");
		}
	}
	return `=?UTF-8?Q?${encoded}?=`;
}

function normalizeItems(items) {
	const payloadItems = Array.isArray(items) ? items : [items];
	return payloadItems.map((item) => Object.assign({}, item));
}

function applyAttachmentOverrides(items, options) {
	if (!options || !Array.isArray(options.attachmentUrls) || options.attachmentUrls.length === 0) {
		return;
	}
	const index = Number.isInteger(options.attachmentItemIndex) ? options.attachmentItemIndex : 0;
	const target = items[index];
	if (!target) {
		return;
	}
	const mimeType = options.attachmentMimeType || "application/pdf";
	const titles = Array.isArray(options.attachmentTitles) ? options.attachmentTitles : [];
	target.attachments = Array.isArray(target.attachments) ? target.attachments.slice() : [];
	options.attachmentUrls.forEach((url, idx) => {
		target.attachments.push({
			title: titles[idx] || url,
			url,
			mimeType
		});
	});
}

function ensureItemIds(items) {
	for (const item of items) {
		if (!item.id) {
			item.id = createSessionId();
		}
		if (Array.isArray(item.attachments)) {
			for (const attachment of item.attachments) {
				if (!attachment.parentItem) {
					attachment.parentItem = item.id;
				}
			}
		}
	}
}

function mergeLooseNotes(items, options) {
	const explicitIndex = options && Number.isInteger(options.noteParentIndex)
		? options.noteParentIndex
		: null;
	const itemsById = new Map();
	const itemsByKey = new Map();
	for (const item of items) {
		if (item.itemType === "note") {
			continue;
		}
		if (item.id) {
			itemsById.set(item.id, item);
		}
		if (item.key) {
			itemsByKey.set(item.key, item);
		}
	}
	let defaultParent = null;
	if (explicitIndex !== null) {
		defaultParent = items[explicitIndex] || null;
	}
	else {
		defaultParent = items.find((item) => item.itemType !== "note") || null;
	}

	const remaining = [];
	for (const item of items) {
		if (item.itemType !== "note") {
			remaining.push(item);
			continue;
		}
		let parent = null;
		if (item.parentItem) {
			parent = itemsById.get(item.parentItem) || itemsByKey.get(item.parentItem) || null;
		}
		if (!parent) {
			parent = defaultParent;
		}
		if (!parent) {
			remaining.push(item);
			continue;
		}
		parent.notes = Array.isArray(parent.notes) ? parent.notes.slice() : [];
		const noteEntry = { note: item.note || item.noteContent || "" };
		if (item.tags) {
			noteEntry.tags = item.tags;
		}
		parent.notes.push(noteEntry);
	}
	return remaining;
}

function buildSaveItemsPayload(items, options) {
	const payload = { items };
	payload.sessionID = (options && options.sessionID) || createSessionId();
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

async function postJson(method, payload, options) {
	const response = await request({
		method: "POST",
		uri: toUrl(`/connector/${method}`),
		body: payload,
		headers: buildHeaders(options, { "Content-Type": "application/json" }),
		json: true,
		timeout: DEFAULT_TIMEOUT_MS,
		simple: false,
		resolveWithFullResponse: true
	});
	if (response.statusCode >= 400) {
		const detail = typeof response.body === "string" ? response.body : JSON.stringify(response.body);
		throw new Error(`zotero connector ${method} failed (${response.statusCode}): ${detail}`);
	}
	return response.body;
}

async function fetchSnapshotContent(url, options) {
	const headers = {
		"User-Agent": (options && options.userAgent) || DEFAULT_USER_AGENT
	};
	if (options && options.cookie) {
		headers.Cookie = options.cookie;
	}
	const response = await request({
		method: "GET",
		uri: url,
		headers,
		timeout: DEFAULT_TIMEOUT_MS,
		simple: false,
		resolveWithFullResponse: true
	});
	if (response.statusCode >= 400) {
		throw new Error(`snapshot fetch failed (${response.statusCode})`);
	}
	return response.body;
}

function shouldSaveAttachment(attachment) {
	if (!attachment || !attachment.url) {
		return false;
	}
	if (attachment.snapshot === false) {
		return false;
	}
	const mimeType = (attachment.mimeType || "").toLowerCase();
	if (mimeType.includes("pdf") || mimeType.includes("epub")) {
		return true;
	}
	return false;
}

async function saveAttachment(sessionID, attachment, options) {
	const headers = {
		"User-Agent": (options && options.userAgent) || DEFAULT_USER_AGENT
	};
	if (options && options.cookie) {
		headers.Cookie = options.cookie;
	}
	const response = await request({
		method: "GET",
		uri: attachment.url,
		encoding: null,
		headers,
		timeout: DEFAULT_TIMEOUT_MS,
		simple: false,
		resolveWithFullResponse: true
	});
	if (response.statusCode >= 400) {
		throw new Error(`attachment fetch failed (${response.statusCode})`);
	}
	const contentType = attachment.mimeType || response.headers["content-type"] || "application/octet-stream";
	const metadata = {
		sessionID,
		parentItemID: attachment.parentItem,
		url: attachment.url,
		title: rfc2047Encode(attachment.title || attachment.url)
	};
	const saveResponse = await request({
		method: "POST",
		uri: toUrl(`/connector/saveAttachment?sessionID=${encodeURIComponent(sessionID)}`),
		body: response.body,
		headers: buildHeaders(options, {
			"Content-Type": contentType,
			"X-Metadata": JSON.stringify(metadata)
		}),
		timeout: Math.max(DEFAULT_TIMEOUT_MS, 60000),
		simple: false,
		resolveWithFullResponse: true
	});
	if (saveResponse.statusCode >= 400) {
		const detail = typeof saveResponse.body === "string" ? saveResponse.body : JSON.stringify(saveResponse.body);
		throw new Error(`saveAttachment failed (${saveResponse.statusCode}): ${detail}`);
	}
	return saveResponse.statusCode;
}

async function saveSnapshot(sessionID, items, options) {
	const baseItem = items[0];
	const snapshotUrl = (options && options.snapshotUrl) || (baseItem && baseItem.url);
	if (!snapshotUrl) {
		return { skipped: true, reason: "no_url" };
	}
	const snapshotContent = await fetchSnapshotContent(snapshotUrl, options);
	const payload = {
		sessionID,
		items: [{ id: baseItem.id }],
		snapshotContent,
		url: snapshotUrl,
		title: (options && options.snapshotTitle) || baseItem.title || snapshotUrl
	};
	await postJson("saveSingleFile", payload, options);
	return { status: "saved" };
}

async function save(items, options) {
	let normalizedItems = normalizeItems(items);
	applyAttachmentOverrides(normalizedItems, options);
	ensureItemIds(normalizedItems);
	normalizedItems = mergeLooseNotes(normalizedItems, options);

	const payload = buildSaveItemsPayload(normalizedItems, options);
	await postJson("saveItems", payload, options);

	const sessionID = payload.sessionID;
	const results = {
		statusCode: 201,
		sessionID,
		attachmentsSaved: 0,
		resolverAttempts: 0,
		snapshot: null,
		attachmentErrors: [],
		resolverErrors: []
	};

	const saveAttachments = options && options.saveAttachments === false ? false : true;
	const hasAttachmentUrls = options && Array.isArray(options.attachmentUrls) && options.attachmentUrls.length > 0;
	const useAttachmentResolvers = options && typeof options.useAttachmentResolvers === "boolean"
		? options.useAttachmentResolvers
		: !hasAttachmentUrls;
	const saveSnapshotEnabled = options && options.saveSnapshot ? true : false;

	if (saveAttachments) {
		for (const item of normalizedItems) {
			const attachments = Array.isArray(item.attachments) ? item.attachments : [];
			for (const attachment of attachments) {
				if (!shouldSaveAttachment(attachment)) {
					continue;
				}
				try {
					await saveAttachment(sessionID, attachment, options);
					results.attachmentsSaved += 1;
				}
				catch (error) {
					results.attachmentErrors.push({
						url: attachment.url,
						message: error.message || String(error)
					});
				}
			}
		}

		if (useAttachmentResolvers) {
			for (const item of normalizedItems) {
				try {
					const hasResolvers = await postJson("hasAttachmentResolvers", {
						sessionID,
						itemID: item.id
					}, options);
					if (hasResolvers) {
						results.resolverAttempts += 1;
						await postJson("saveAttachmentFromResolver", {
							sessionID,
							itemID: item.id
						}, options);
					}
				}
				catch (error) {
					results.resolverErrors.push({
						itemId: item.id,
						message: error.message || String(error)
					});
				}
			}
		}
	}

	if (saveSnapshotEnabled) {
		try {
			results.snapshot = await saveSnapshot(sessionID, normalizedItems, options);
		}
		catch (error) {
			results.snapshot = { error: error.message || String(error) };
		}
	}

	return results;
}

module.exports = {
	save
};
