import fs from 'node:fs';
import path from 'node:path';
import { encrypt, decrypt } from './crypto.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function ensureDir() {
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
	try {
		if (!fs.existsSync(file)) return fallback;
		const raw = fs.readFileSync(file, 'utf8');
		return raw ? JSON.parse(raw) : fallback;
	} catch (err) {
		console.error(`readJson ${file} failed`, err);
		return fallback;
	}
}

function writeJson(file, data) {
	ensureDir();
	const tmp = file + '.tmp';
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
	fs.renameSync(tmp, file);
}

/* ----------------------------- accounts ----------------------------- */

/**
 * @typedef {Object} StoredAccount
 * @property {string} id
 * @property {string} displayName
 * @property {string} username       // for re-auth / display
 * @property {string} passwordEnc    // encrypted password
 * @property {string} [twoFactorEnc] // encrypted 2FA seed if rememberable (NOT recommended; we don't store TOTP seeds)
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @returns {StoredAccount[]} */
export function listAccounts() {
	const list = readJson(ACCOUNTS_FILE, []);
	// never leak encrypted password
	return list.map((a) => ({
		id: a.id,
		username: a.username,
		displayName: a.displayName,
		createdAt: a.createdAt,
		updatedAt: a.updatedAt
	}));
}

/** @returns {StoredAccount|null} */
export function getAccount(id) {
	const list = readJson(ACCOUNTS_FILE, []);
	const a = list.find((x) => x.id === id);
	if (!a) return null;
	return { ...a, password: a.passwordEnc ? decrypt(a.passwordEnc) : '' };
}

/** @returns {StoredAccount} */
export function upsertAccount({ id, username, displayName, password }) {
	const list = readJson(ACCOUNTS_FILE, []);
	const now = Date.now();
	const existing = list.find((x) => x.id === id);
	const rec = {
		id: id || existing?.id || crypto.randomUUID(),
		username,
		displayName: displayName || username,
		passwordEnc: password ? encrypt(password) : existing?.passwordEnc || '',
		createdAt: existing?.createdAt || now,
		updatedAt: now
	};
	const idx = list.findIndex((x) => x.id === rec.id);
	if (idx >= 0) list[idx] = rec;
	else list.push(rec);
	writeJson(ACCOUNTS_FILE, list);
	return {
		id: rec.id,
		username: rec.username,
		displayName: rec.displayName,
		createdAt: rec.createdAt,
		updatedAt: rec.updatedAt
	};
}

export function deleteAccount(id) {
	const list = readJson(ACCOUNTS_FILE, []);
	const next = list.filter((x) => x.id !== id);
	writeJson(ACCOUNTS_FILE, next);
	// also drop sessions
	const sessions = readJson(SESSIONS_FILE, {});
	if (sessions[id]) {
		delete sessions[id];
		writeJson(SESSIONS_FILE, sessions);
	}
}

/* ----------------------------- sessions ----------------------------- */

/**
 * Cached login info per account. We store:
 *   - `cookie`: raw "auth=..." cookie value (server-side only, never sent to client)
 *   - `userId`, `displayName`: convenience
 *   - `pipelineConnected`: bool
 *   - `lastError`: string
 *   - `lastLoginAt`: number
 */
export function getSession(accountId) {
	const sessions = readJson(SESSIONS_FILE, {});
	return sessions[accountId] || null;
}

export function setSession(accountId, session) {
	const sessions = readJson(SESSIONS_FILE, {});
	sessions[accountId] = { ...(sessions[accountId] || {}), ...session, updatedAt: Date.now() };
	writeJson(SESSIONS_FILE, sessions);
}

export function clearSession(accountId) {
	const sessions = readJson(SESSIONS_FILE, {});
	delete sessions[accountId];
	writeJson(SESSIONS_FILE, sessions);
}

export function listSessions() {
	return readJson(SESSIONS_FILE, {});
}
