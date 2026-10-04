import { setSession, getSession, peekSession, getAccount } from './accounts.js';

const API_BASE = 'https://api.vrchat.cloud/api/1';
const WS_BASE = 'wss://pipeline.vrchat.cloud';

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 VRCActivity/0.1';

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const RELOGIN_COOLDOWN_MS = 60_000;

/**
 * Minimal VRChat REST client. Each "session" is identified by an accountId and
 * uses a cookie jar stored server-side (auth= / twoFactorAuth= cookies).
 */

function basicAuthHeader(username, password) {
	return 'Basic ' + Buffer.from(`${encodeURIComponent(username)}:${encodeURIComponent(password)}`).toString('base64');
}

function parseSetCookie(setCookie) {
	if (!setCookie) return [];
	return setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/).map((s) => s.trim());
}

function errorMessage(status, data) {
	const msg = data?.error?.message || data?.error || `HTTP ${status}`;
	return typeof msg === 'string' ? msg.replace(/^"|"$/g, '') : JSON.stringify(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Per-account silent relogin state. `promise` is set while a relogin is in
 * flight so concurrent 401s all await the same attempt; `failedAt` throttles
 * retries after a failure (avoids hammering VRChat and re-sending email OTPs).
 * @type {Map<string, { promise?: Promise<boolean>, failedAt?: number }>}
 */
const _relogin = new Map();

function reloginOnce(accountId) {
	const cur = _relogin.get(accountId);
	if (cur?.promise) return cur.promise;
	if (cur?.failedAt && Date.now() - cur.failedAt < RELOGIN_COOLDOWN_MS) return Promise.resolve(false);
	const promise = attemptRelogin(accountId)
		.catch((err) => {
			console.error(`[vrchat] relogin ${accountId} threw: ${err.message}`);
			return false;
		})
		.then((ok) => {
			_relogin.set(accountId, ok ? {} : { failedAt: Date.now() });
			return ok;
		});
	_relogin.set(accountId, { promise });
	return promise;
}

/**
 * Re-authenticate with the stored password. The cookie jar is kept (only
 * `auth` gets overwritten by the response) and the `twoFactorAuth` cookie is
 * sent along, so accounts with 2FA relogin silently like VRCX does.
 * @param {string} accountId
 * @returns {Promise<boolean>} true if re-auth succeeded
 */
async function attemptRelogin(accountId) {
	const acct = getAccount(accountId);
	if (!acct?.username || !acct?.password) {
		console.log(`[vrchat] cannot relogin ${accountId}: no stored credentials`);
		return false;
	}
	console.log(`[vrchat] attempting silent relogin for ${accountId}`);
	const result = await login(accountId, acct.username, acct.password);
	if (result.ok) {
		console.log(`[vrchat] relogin ${accountId} ok`);
		return true;
	}
	if (result.requires2fa) {
		console.log(`[vrchat] relogin ${accountId} requires 2FA — manual action needed`);
		setSession(accountId, { lastError: 'Cookie expired; needs 2FA to re-login' });
		return false;
	}
	console.log(`[vrchat] relogin ${accountId} failed: ${result.error}`);
	setSession(accountId, { lastError: `Re-login failed: ${result.error}` });
	return false;
}

function cookieHeaderFromJar(jar) {
	if (!jar) return undefined;
	return jar
		.split(';')
		.map((c) => c.trim())
		.filter(Boolean)
		.join('; ');
}

function parseJar(jar) {
	return new Map(
		(jar || '')
			.split(';')
			.map((c) => c.trim())
			.filter(Boolean)
			.map((c) => {
				const idx = c.indexOf('=');
				return [c.slice(0, idx), c.slice(idx + 1)];
			})
	);
}

function updateJar(jar, setCookieArr) {
	if (!setCookieArr?.length) return jar;
	const map = parseJar(jar);
	for (const c of setCookieArr) {
		const parts = c.split(';');
		const idx = parts[0].indexOf('=');
		if (idx < 0) continue;
		const k = parts[0].slice(0, idx).trim();
		const v = parts[0].slice(idx + 1).trim();
		if (k.startsWith('__')) continue; // ignore __cf_bm / __ddg* etc
		// A cookie VRChat expires (Max-Age<=0 / past Expires / empty value) is a deletion.
		let expired = v === '';
		for (const attr of parts.slice(1)) {
			const a = attr.trim();
			const lower = a.toLowerCase();
			if (lower.startsWith('max-age=') && Number(lower.slice(8)) <= 0) expired = true;
			if (lower.startsWith('expires=')) {
				const t = Date.parse(a.slice(8));
				if (!Number.isNaN(t) && t <= Date.now()) expired = true;
			}
		}
		if (expired) map.delete(k);
		else map.set(k, v);
	}
	return Array.from(map.entries())
		.map(([k, v]) => `${k}=${v}`)
		.join('; ');
}

function getJar(accountId) {
	return peekSession(accountId)?.cookie || null;
}

function persistCookie(accountId, jar) {
	setSession(accountId, { cookie: jar || '' });
}

/** Only the long-lived 2FA cookie from the jar (what a Basic-auth login should carry). */
function twoFactorCookie(jar) {
	const v = parseJar(jar).get('twoFactorAuth');
	return v ? `twoFactorAuth=${v}` : undefined;
}

function buildUrl(path, params) {
	const base = path.startsWith('http') ? path : `${API_BASE}/${path.replace(/^\//, '')}`;
	if (!params) return base;
	const q = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null || v === '') continue;
		q.set(k, String(v));
	}
	const qs = q.toString();
	if (!qs) return base;
	return base + (base.includes('?') ? '&' : '?') + qs;
}

/**
 * Low-level fetch wrapper.
 *  - `params`      object serialised into the query string
 *  - `skipAuth`    don't send the stored cookie jar
 *  - `noRelogin`   never trigger the silent relogin on 401 (login / 2FA calls)
 *  - GETs are retried with backoff on 429/502/503/504 (honours Retry-After)
 *  - a 401 on a logged-in account triggers one shared silent relogin + replay
 * @param {string} accountId
 * @param {string} path
 * @param {object} [opts]
 * @param {boolean} [opts._retried] internal: marks a request as already-retried
 * @returns {Promise<{ status: number, data: any }>}
 */
export async function api(accountId, path, opts = {}) {
	const method = (opts.method || 'GET').toUpperCase();
	const url = buildUrl(path, opts.params);
	// Only accounts that currently hold a session may silently relogin; after a
	// logout the session is cleared and a stray 401 must not resurrect it.
	const mayRelogin = !opts.skipAuth && !opts.noRelogin && !opts._retried && !!peekSession(accountId)?.user;

	const doFetch = async () => {
		const headers = {
			'User-Agent': USER_AGENT,
			Accept: 'application/json',
			...opts.headers
		};
		if (opts.body && !headers['Content-Type']) {
			headers['Content-Type'] = 'application/json';
		}
		if (!opts.skipAuth) {
			const jar = getJar(accountId);
			if (jar) headers.Cookie = cookieHeaderFromJar(jar);
		}
		const res = await fetch(url, {
			method,
			headers,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			body: opts.body
				? typeof opts.body === 'string'
					? opts.body
					: JSON.stringify(opts.body)
				: undefined
		});

		// update cookie jar from response
		const setCookie = res.headers.getSetCookie?.() ?? parseSetCookie(res.headers.get('set-cookie'));
		if (setCookie.length) {
			const jar = updateJar(getJar(accountId), setCookie);
			if (jar !== getJar(accountId)) persistCookie(accountId, jar);
		}

		let data = null;
		const text = await res.text();
		if (text) {
			try {
				data = JSON.parse(text);
			} catch {
				data = text;
			}
		}

		const ra = Number(res.headers.get('retry-after'));
		return { status: res.status, data, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null };
	};

	let res = await doFetch();

	if (method === 'GET') {
		for (let attempt = 0; attempt < MAX_RETRIES && RETRY_STATUS.has(res.status); attempt++) {
			const delay = res.retryAfter ? Math.min(res.retryAfter * 1000, 30_000) : Math.min(1000 * 2 ** attempt, 8000);
			await sleep(delay + Math.random() * 250);
			res = await doFetch();
		}
	}

	if (res.status === 401 && mayRelogin) {
		const ok = await reloginOnce(accountId);
		if (ok) return api(accountId, path, { ...opts, _retried: true });
	}

	return res;
}

/* ---------------------------- public API ---------------------------- */

/**
 * Try to log in with Basic auth. On success the cookie is persisted. An
 * existing `twoFactorAuth` cookie is sent along (never the stale `auth`) so a
 * remembered device doesn't need a new 2FA code.
 * @param {string} accountId
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ ok: boolean, user?: any, requires2fa?: string[], error?: string }>}
 */
export async function login(accountId, username, password) {
	const headers = { Authorization: basicAuthHeader(username, password) };
	const tfa = twoFactorCookie(getJar(accountId));
	if (tfa) headers.Cookie = tfa;
	const { status, data } = await api(accountId, 'auth/user', {
		method: 'GET',
		skipAuth: true,
		noRelogin: true,
		headers
	});

	if (status === 200 && data && !data.requiresTwoFactorAuth) {
		setSession(accountId, { user: data, lastLoginAt: Date.now(), lastError: null });
		return { ok: true, user: data };
	}
	if (data?.requiresTwoFactorAuth) {
		// Cookie is now set on the server (auth=); we can call /auth/user again later
		// Normalize to lowercase so the client doesn't have to care about VRChat's
		// mixed-case values ('totp', 'emailOtp', 'otp').
		const methods = (data.requiresTwoFactorAuth || []).map((m) => String(m).toLowerCase());
		return { ok: false, requires2fa: methods };
	}
	return { ok: false, error: errorMessage(status, data) };
}

/**
 * @param {string} accountId
 * @param {string} method  any case of 'totp' | 'emailotp' | 'otp'
 * @param {string} code
 */
export async function verify2fa(accountId, method, code) {
	const m = String(method || '').toLowerCase();
	const endpoint =
		m === 'totp'
			? 'auth/twofactorauth/totp/verify'
			: m === 'emailotp'
				? 'auth/twofactorauth/emailotp/verify'
				: m === 'otp'
					? 'auth/twofactorauth/otp/verify'
					: null;
	if (!endpoint) {
		return { ok: false, error: `Unknown 2FA method: ${method}` };
	}
	// Recovery codes are XXXX-XXXX; totp / email codes are plain digits.
	let normalized = String(code ?? '').trim();
	if (m === 'otp') {
		const raw = normalized.replace(/[^a-z0-9]/gi, '');
		normalized = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
	}
	const { status, data } = await api(accountId, endpoint, {
		method: 'POST',
		body: { code: normalized },
		noRelogin: true
	});
	if (status === 200) {
		// After verification we can fetch the actual user
		const me = await api(accountId, 'auth/user', { noRelogin: true });
		if (me.status === 200 && me.data && !me.data.error && !me.data.requiresTwoFactorAuth) {
			setSession(accountId, { user: me.data, lastLoginAt: Date.now(), lastError: null });
			return { ok: true, user: me.data };
		}
		return {
			ok: false,
			error: me.data?.requiresTwoFactorAuth
				? '2FA verified but VRChat still reports the session as unauthenticated'
				: errorMessage(me.status, me.data)
		};
	}
	return { ok: false, error: errorMessage(status, data) };
}

/**
 * Refresh the current user (also validates the cookie is still alive).
 * A 200 carrying `requiresTwoFactorAuth` is a pending-2FA stub, not a user.
 * @param {string} accountId
 */
export async function getCurrentUser(accountId) {
	const r = await checkSession(accountId);
	return r.ok ? r.user : null;
}

/**
 * Like getCurrentUser, but says *why* it failed so callers can tell a dead
 * session (`definite`: bad cookie, relogin failed, needs 2FA) from a transient
 * outage (429 / 5xx) that is worth retrying. Network errors still throw.
 * @param {string} accountId
 * @returns {Promise<{ ok: true, user: any } | { ok: false, definite: boolean, status: number, error: string }>}
 */
export async function checkSession(accountId) {
	const { status, data } = await api(accountId, 'auth/user');
	if (status === 200 && data && !data.error) {
		if (data.requiresTwoFactorAuth) {
			setSession(accountId, { lastError: 'Session needs 2FA verification' });
			return { ok: false, definite: true, status, error: 'Session needs 2FA verification' };
		}
		setSession(accountId, { user: data });
		return { ok: true, user: data };
	}
	const transient = status === 429 || status >= 500;
	return { ok: false, definite: !transient, status, error: errorMessage(status, data) };
}

/**
 * Request a pipeline WebSocket auth token.
 * @param {string} accountId
 * @returns {Promise<string|null>}
 */
export async function getPipelineToken(accountId) {
	const { status, data } = await api(accountId, 'auth');
	if (status === 200 && data?.token) {
		setSession(accountId, { pipelineToken: data.token, pipelineTokenAt: Date.now() });
		return data.token;
	}
	return null;
}

/** @returns {string} */
export function getWebsocketUrl() {
	return WS_BASE;
}

/* ---------------------- friends / world / avatar ---------------------- */

export async function getFriends(accountId, params = {}) {
	const q = new URLSearchParams();
	if (params.offline !== undefined) q.set('offline', String(params.offline));
	if (params.n) q.set('n', String(params.n));
	if (params.offset) q.set('offset', String(params.offset));
	const qs = q.toString();
	const { status, data } = await api(accountId, 'auth/user/friends' + (qs ? `?${qs}` : ''));
	if (status === 200) return data;
	throw new Error(`getFriends failed: HTTP ${status}`);
}

/**
 * @param {string} accountId
 * @returns {Promise<{ friends: string[], onlineFriends: string[], activeFriends: string[], offlineFriends?: string[] } | null>}
 */
export async function getFriendLists(accountId) {
	const { status, data } = await api(accountId, 'auth/user');
	if (status !== 200 || !data || data.error || data.requiresTwoFactorAuth) return null;
	return {
		friends: data.friends || [],
		onlineFriends: data.onlineFriends || [],
		activeFriends: data.activeFriends || [],
		offlineFriends: data.offlineFriends || []
	};
}

export async function getWorld(accountId, worldId) {
	const { status, data } = await api(accountId, `worlds/${worldId}`);
	if (status === 200) return data;
	return null;
}

export async function getAvatar(accountId, avatarId) {
	const { status, data } = await api(accountId, `avatars/${avatarId}`);
	if (status === 200) return data;
	return null;
}

/**
 * Set the account's current avatar (换装).
 * @param {string} accountId
 * @param {string} avatarId
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function selectAvatar(accountId, avatarId) {
	const { status, data } = await api(accountId, `avatars/${avatarId}/select`, {
		method: 'PUT'
	});
	if (status === 200) return { ok: true };
	return { ok: false, error: errorMessage(status, data) };
}

/**
 * Full user details
 * @param {string} accountId
 * @param {string} userId
 */
export async function getUser(accountId, userId) {
	const { status, data } = await api(accountId, `users/${userId}`);
	if (status === 200) return data;
	return null;
}

/**
 * Public profile (bio, status, etc.)
 * @param {string} accountId
 * @param {string} userId
 */
export async function getProfile(accountId, userId) {
	const { status, data } = await api(accountId, `profile/${userId}`);
	if (status === 200) return data;
	return null;
}

/**
 * Avatars authored by the user. VRChat only lists the logged-in user's own
 * avatars (`user=me`); for anyone else there is nothing to list.
 * Returns null when the request failed (as opposed to an empty list).
 * @param {string} accountId
 * @param {string} userId
 */
export async function getUserAvatars(accountId, userId) {
	const me = peekSession(accountId)?.user?.id;
	if (!me || me !== userId) return [];
	const { status, data } = await api(accountId, 'avatars', {
		params: { n: 50, offset: 0, sort: 'updated', order: 'descending', releaseStatus: 'all', user: 'me' }
	});
	return status === 200 && Array.isArray(data) ? data : null;
}

/**
 * Worlds authored by the user (public ones; everything for the own account).
 * Returns null when the request failed (as opposed to an empty list).
 * @param {string} accountId
 * @param {string} userId
 */
export async function getUserWorlds(accountId, userId) {
	const params = { n: 50, offset: 0, sort: 'updated', order: 'descending', userId, releaseStatus: 'public' };
	if (peekSession(accountId)?.user?.id === userId) {
		params.user = 'me';
		params.releaseStatus = 'all';
	}
	const { status, data } = await api(accountId, 'worlds', { params });
	return status === 200 && Array.isArray(data) ? data : null;
}

/**
 * Add / remove a player moderation (mute / block / unmute / unblock).
 * Adding is POST playermoderations; undoing is PUT unplayermoderate with the
 * type being removed — VRChat's current API (and VRCX) no longer uses an
 * "unmute" record.
 * @param {string} accountId
 * @param {string} moderatedUserId
 * @param {'mute'|'block'|'unmute'|'unblock'} type
 */
export async function addModeration(accountId, moderatedUserId, type) {
	if (type === 'unmute' || type === 'unblock') {
		return api(accountId, 'auth/user/unplayermoderate', {
			method: 'PUT',
			body: { moderated: moderatedUserId, type: type === 'unmute' ? 'mute' : 'block' }
		});
	}
	return api(accountId, 'auth/user/playermoderations', {
		method: 'POST',
		body: { moderated: moderatedUserId, type }
	});
}

/**
 * Send a request-invite to a user (asks them to invite you to their instance).
 * VRChat has no free-form request message — only canned slots (`requestSlot`,
 * see getInviteMessages) — so by default just the platform is sent, like VRCX.
 * @param {string} accountId
 * @param {string} userId
 * @param {{ requestSlot?: number }} [opts]
 */
export async function sendRequestInvite(accountId, userId, opts = {}) {
	const body = { platform: 'standalonewindows' };
	// a preset "request" message (slot 0-11) instead of the bare request
	if (Number.isInteger(opts.requestSlot)) body.requestSlot = opts.requestSlot;
	const { status, data } = await api(accountId, `requestInvite/${userId}`, {
		method: 'POST',
		body
	});
	if (status === 200) return { ok: true, data };
	return { ok: false, status, error: errorMessage(status, data) };
}

/**
 * Remove a friend relationship (DELETE /auth/user/friends/:userId).
 * @param {string} accountId
 * @param {string} userId
 */
export async function unfriend(accountId, userId) {
	const { status, data } = await api(accountId, `auth/user/friends/${userId}`, { method: 'DELETE' });
	return { ok: status === 200 || status === 204, status, data };
}

/**
 * Update the account's own profile. Like VRCX, bio / bioLinks go to
 * PUT /profile/:id (they moved off /users/:id) while status,
 * statusDescription and pronouns stay on PUT /users/:id.
 * @param {string} accountId
 * @param {object} params allowed: bio, bioLinks, status, statusDescription, pronouns
 */
export async function updateOwnProfile(accountId, params) {
	const sess = getSession(accountId);
	const userId = sess?.user?.id || sess?.userId;
	if (!userId) return { ok: false, error: 'not logged in' };

	const profilePayload = {};
	const userPayload = {};
	for (const [k, v] of Object.entries(params || {})) {
		if (k === 'bio' || k === 'bioLinks') profilePayload[k] = v;
		else userPayload[k] = v;
	}

	let last = { status: 200, data: null };
	if (Object.keys(profilePayload).length) {
		last = await api(accountId, `profile/${userId}`, { method: 'PUT', body: profilePayload });
		if (last.status !== 200) return { ok: false, status: last.status, data: last.data };
	}
	if (Object.keys(userPayload).length) {
		const r = await api(accountId, `users/${userId}`, { method: 'PUT', body: userPayload });
		if (r.status !== 200) return { ok: false, status: r.status, data: r.data };
		last = r;
	}
	return { ok: true, status: last.status, data: last.data };
}

export async function sendFriendRequest(accountId, userId) {
	const { status, data } = await api(accountId, `user/${userId}/friendRequest`, {
		method: 'POST'
	});
	return { ok: status === 200, status, data };
}

/**
 * Invite a friend to join a specific instance. Payload matches VRCX:
 * instanceId and worldId both carry the full location tag.
 * @param {string} accountId
 * @param {string} userId
 * @param {string} location  e.g. "wrld_xxx:12345~private(usr_x)"
 * @param {{ worldName?: string, messageSlot?: number }} [opts]
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function sendInvite(accountId, userId, location, opts = {}) {
	const body = { instanceId: location, worldId: location };
	if (opts.worldName) body.worldName = opts.worldName;
	// a preset "message" (slot 0-11) attached to the invite
	if (Number.isInteger(opts.messageSlot)) body.messageSlot = opts.messageSlot;
	const { status, data } = await api(accountId, `invite/${userId}`, {
		method: 'POST',
		body
	});
	if (status === 200) return { ok: true, data };
	return { ok: false, status, error: errorMessage(status, data) };
}

function listResult(status, data) {
	const ok = status === 200 && Array.isArray(data);
	return { ok, status, data: ok ? data : [], error: ok ? undefined : errorMessage(status, data) };
}

/**
 * Search users (displayName fuzzy match)
 * @param {string} accountId
 * @param {{ search?: string, n?: number, offset?: number, fuzzy?: boolean, sort?: 'relevance'|'last_login', developerType?: string, customFields?: string }} params
 */
export async function searchUsers(accountId, params = {}) {
	const q = new URLSearchParams();
	if (params.search) q.set('search', params.search);
	q.set('n', String(params.n ?? 20));
	q.set('offset', String(params.offset ?? 0));
	if (params.fuzzy) q.set('fuzzy', '1');
	if (params.sort) q.set('sort', params.sort);
	if (params.developerType) q.set('developerType', params.developerType);
	if (params.customFields) q.set('customFields', params.customFields);
	const { status, data } = await api(accountId, `users?${q.toString()}`);
	return listResult(status, data);
}

/**
 * Search worlds
 * @param {string} accountId
 * @param {{ search?: string, n?: number, offset?: number, sort?: 'relevance'|'popularity'|'last_updated'|'created_at', releaseStatus?: string, featured?: boolean }} params
 */
export async function searchWorlds(accountId, params = {}) {
	const q = new URLSearchParams();
	if (params.search) q.set('search', params.search);
	q.set('n', String(params.n ?? 20));
	q.set('offset', String(params.offset ?? 0));
	if (params.sort) q.set('sort', params.sort);
	if (params.releaseStatus) q.set('releaseStatus', params.releaseStatus);
	if (params.featured) q.set('featured', 'true');
	const { status, data } = await api(accountId, `worlds?${q.toString()}`);
	return listResult(status, data);
}

/**
 * Search avatars
 * @param {string} accountId
 * @param {{ search?: string, n?: number, offset?: number, sort?: 'relevance'|'popularity'|'last_updated'|'created_at', releaseStatus?: string, featured?: boolean }} params
 */
export async function searchAvatars(accountId, params = {}) {
	const q = new URLSearchParams();
	if (params.search) q.set('search', params.search);
	// VRChat now rejects text searches without an explicit marketplace.
	q.set('marketplace', params.marketplace || 'all');
	q.set('n', String(params.n ?? 20));
	q.set('offset', String(params.offset ?? 0));
	if (params.sort) q.set('sort', params.sort);
	if (params.releaseStatus) q.set('releaseStatus', params.releaseStatus);
	if (params.featured) q.set('featured', 'true');
	const { status, data } = await api(accountId, `avatars?${q.toString()}`);
	return listResult(status, data);
}

/**
 * Fetch the account's notifications (V2 `notifications` endpoint).
 * @param {string} accountId
 * @param {{ n?: number, offset?: number, type?: string }} [params]
 */
export async function getNotifications(accountId, params = {}) {
	const q = new URLSearchParams();
	if (params.n) q.set('n', String(params.n));
	if (params.offset !== undefined) q.set('offset', String(params.offset));
	if (params.type) q.set('type', String(params.type));
	const qs = q.toString();
	const { status, data } = await api(accountId, 'notifications' + (qs ? `?${qs}` : ''));
	if (status === 200 && Array.isArray(data)) return data;
	return [];
}

/**
 * Fetch the per-account player moderation list. Returns an array of
 * { id, type, created: ISO, sourceUserId, targetDisplayName, targetUserId,
 * targetThumbnailImageUrl }.
 *
 * @param {string} accountId
 * @param {string} [type]  one of 'mute' | 'block' | 'unmute' | 'unblock'
 */
export async function getPlayerModerations(accountId, type) {
	const q = type ? `?type=${encodeURIComponent(type)}` : '';
	const { status, data } = await api(accountId, `auth/user/playermoderations${q}`);
	return { ok: status === 200 && Array.isArray(data), data: Array.isArray(data) ? data : [] };
}

/**
 * Create a new instance on the current user's account.
 * @param {string} accountId
 * @param {{
 *   worldId: string,
 *   type?: 'public'|'friends'|'hidden'|'private'|'group',
 *   canRequestInvite?: boolean,
 *   region?: 'us'|'use'|'eu'|'jp',
 *   ownerId?: string,
 *   groupAccessType?: 'public'|'plus'|'members',
 *   roleIds?: string[],
 *   queueEnabled?: boolean,
 *   displayName?: string,
 *   ageGate?: boolean
 * }} params
 */
export async function createInstance(accountId, params = {}) {
	const body = { ...params };
	const { status, data } = await api(accountId, 'instances', {
		method: 'POST',
		body
	});
	return { ok: status === 200 || status === 201, status, data };
}

/**
 * Send a self-invite to an instance. Works for every access type
 * (public / friends / group / invite / invite+); only entering the
 * instance is gated by access rules on the client side.
 * @param {string} accountId
 * @param {string} location  e.g. "wrld_xxx:12345"
 * @param {string} [shortName]  instance shortName, when known
 */
export async function selfInvite(accountId, location, shortName) {
	// Match VRCX: VRChat's invite/myself/to endpoint expects a JSON body
	// ({} or { shortName }). Without one, some instances / WAF rules reject
	// the request as malformed even though the path looks fine.
	const { status, data } = await api(accountId, `invite/myself/to/${location}`, {
		method: 'POST',
		body: shortName ? { shortName } : {},
		headers: { 'Content-Type': 'application/json' }
	});
	return { ok: status === 200 || status === 201, status, data };
}

/**
 * Fetch shortName for an instance, which can be used to invite via a
 * shorter URL.
 */
export async function getInstanceShortName(accountId, location) {
	const { status, data } = await api(
		accountId,
		`instances/${location}/shortName`
	);
	return { ok: status === 200, status, data };
}

/* ------------------- preset messages (invite / request) ------------------- */

export const MESSAGE_TYPES = ['message', 'request', 'response', 'requestResponse'];

/**
 * The 12 preset message slots of one kind:
 *   message         – sent with an invite
 *   request         – sent with a request-invite
 *   response        – decline reply to an invite
 *   requestResponse – decline reply to a request-invite
 * @param {string} accountId
 * @param {string} messageType
 * @returns {Promise<{ ok: boolean, messages: Array<{ slot: number, message: string, remainingCooldownMinutes?: number }>, error?: string }>}
 */
export async function getInviteMessages(accountId, messageType) {
	const me = peekSession(accountId)?.user?.id;
	if (!me) return { ok: false, messages: [], error: 'not logged in' };
	if (!MESSAGE_TYPES.includes(messageType)) return { ok: false, messages: [], error: 'bad message type' };
	const { status, data } = await api(accountId, `message/${me}/${messageType}`);
	if (status !== 200 || !Array.isArray(data)) return { ok: false, messages: [], error: errorMessage(status, data) };
	return {
		ok: true,
		messages: data
			.map((m) => ({
				slot: m.slot,
				message: m.message || '',
				remainingCooldownMinutes: m.remainingCooldownMinutes || 0
			}))
			.sort((a, b) => a.slot - b.slot)
	};
}

/**
 * Edit one preset message. VRChat puts an edited slot on a cooldown (~60 min);
 * an edit during the cooldown is silently ignored, which is detected here.
 * @param {string} accountId
 * @param {string} messageType
 * @param {number} slot
 * @param {string} message
 */
export async function editInviteMessage(accountId, messageType, slot, message) {
	const me = peekSession(accountId)?.user?.id;
	if (!me) return { ok: false, error: 'not logged in' };
	if (!MESSAGE_TYPES.includes(messageType) || !Number.isInteger(slot)) return { ok: false, error: 'bad request' };
	const { status, data } = await api(accountId, `message/${me}/${messageType}/${slot}`, {
		method: 'PUT',
		body: { message }
	});
	if (status !== 200) return { ok: false, error: errorMessage(status, data) };
	const updated = Array.isArray(data) ? data.find((m) => m.slot === slot) : null;
	if (updated && updated.message !== message) {
		return { ok: false, error: `这个消息槽还在冷却中（约 ${updated.remainingCooldownMinutes || '?'} 分钟），暂时不能修改` };
	}
	return { ok: true };
}

/* --------------------------- notification actions --------------------------- */

/** Accept an incoming friend request (the notification id, not the user id). */
export async function acceptFriendRequest(accountId, notificationId) {
	const { status, data } = await api(accountId, `auth/user/notifications/${notificationId}/accept`, { method: 'PUT' });
	return { ok: status === 200, status, error: status === 200 ? undefined : errorMessage(status, data) };
}

/** Hide (dismiss) a notification on VRChat's side so it also disappears in-game. */
export async function hideNotification(accountId, notificationId, { v2 = false } = {}) {
	const { status, data } = v2
		? await api(accountId, `notifications/${notificationId}`, { method: 'DELETE' })
		: await api(accountId, `auth/user/notifications/${notificationId}/hide`, { method: 'PUT' });
	return { ok: status === 200, status, error: status === 200 ? undefined : errorMessage(status, data) };
}

/** Mark a notification as seen on VRChat's side. */
export async function seeNotification(accountId, notificationId, { v2 = false } = {}) {
	const { status, data } = v2
		? await api(accountId, `notifications/${notificationId}/see`, { method: 'POST' })
		: await api(accountId, `auth/user/notifications/${notificationId}/see`, { method: 'PUT' });
	return { ok: status === 200, status, error: status === 200 ? undefined : errorMessage(status, data) };
}

/**
 * Reply to an invite / request-invite notification with one of the preset
 * response messages (declines it).
 * @param {number} responseSlot  slot of the `response` / `requestResponse` message
 */
export async function respondToInvite(accountId, notificationId, responseSlot) {
	const { status, data } = await api(accountId, `invite/${notificationId}/response`, {
		method: 'POST',
		body: { responseSlot }
	});
	return { ok: status === 200, status, error: status === 200 ? undefined : errorMessage(status, data) };
}

/** Withdraw a sent friend request / decline a hidden one. */
export async function cancelFriendRequest(accountId, userId) {
	const { status, data } = await api(accountId, `user/${userId}/friendRequest`, { method: 'DELETE' });
	return { ok: status === 200, status, error: status === 200 ? undefined : errorMessage(status, data) };
}

/* --------------------------------- notes --------------------------------- */

/**
 * VRChat's own per-user note (synced across devices, visible in-game).
 * @returns {Promise<{ ok: boolean, note?: string, error?: string }>}
 */
export async function saveUserNote(accountId, targetUserId, note) {
	const { status, data } = await api(accountId, 'userNotes', {
		method: 'POST',
		body: { targetUserId, note }
	});
	if (status !== 200) return { ok: false, error: errorMessage(status, data) };
	return { ok: true, note: data?.note ?? note };
}

/* ------------------------------- favorites ------------------------------- */

/** @param {'friend'|'world'|'avatar'|'vrcPlusWorld'} type */
const FAVORITE_TYPES = ['friend', 'world', 'avatar', 'vrcPlusWorld'];

/**
 * The account's VRChat-side favorites: groups, entries and limits.
 * @returns {Promise<{ ok: boolean, groups: any[], favorites: any[], limits: any, error?: string }>}
 */
export async function getVrcFavorites(accountId) {
	const pageAll = async (path, params) => {
		const out = [];
		for (let offset = 0; offset < 2000; offset += 100) {
			const { status, data } = await api(accountId, path, { params: { ...params, n: 100, offset } });
			if (status !== 200 || !Array.isArray(data)) throw new Error(errorMessage(status, data));
			out.push(...data);
			if (data.length < 100) break;
		}
		return out;
	};
	try {
		const [groups, favorites, lim] = await Promise.all([
			pageAll('favorite/groups'),
			pageAll('favorites'),
			api(accountId, 'auth/user/favoritelimits')
		]);
		const limits = lim.status === 200 ? lim.data : null;
		return {
			ok: true,
			groups: buildFavoriteGroups(accountId, groups, limits),
			favorites: favorites.map((f) => ({
				id: f.id,
				type: f.type,
				favoriteId: f.favoriteId,
				group: Array.isArray(f.tags) ? f.tags[0] : ''
			})),
			limits
		};
	} catch (err) {
		return { ok: false, groups: [], favorites: [], limits: null, error: err.message };
	}
}

/**
 * VRChat's `favorite/groups` lists only the groups that already exist, but an
 * account can use as many groups as its limits allow (VRCX generates them the
 * same way): friend `group_0..`, world `worlds1..`, avatar `avatars1..` and —
 * for VRC+ — `vrcPlusWorlds1..`. The API's metadata (display name) is overlaid.
 */
function buildFavoriteGroups(accountId, apiGroups, limits) {
	const max = limits?.maxFavoriteGroups || { friend: 3, world: 4, vrcPlusWorld: 4, avatar: 1 };
	const supporter = (peekSession(accountId)?.user?.tags || []).includes('system_supporter');
	const out = [];
	const make = (count, type, nameOf, labelOf) => {
		for (let i = 0; i < count; i++) out.push({ id: null, type, name: nameOf(i), displayName: labelOf(i), visibility: 'private' });
	};
	make(max.friend ?? 3, 'friend', (i) => `group_${i}`, (i) => `Group ${i + 1}`);
	make(max.world ?? 4, 'world', (i) => `worlds${i + 1}`, (i) => `Group ${i + 1}`);
	make(max.avatar ?? 1, 'avatar', (i) => `avatars${i + 1}`, (i) => `Group ${i + 1}`);
	if (supporter || apiGroups.some((g) => g.type === 'vrcPlusWorld')) {
		make(max.vrcPlusWorld ?? 4, 'vrcPlusWorld', (i) => `vrcPlusWorlds${i + 1}`, (i) => `VRC+ Group ${i + 1}`);
	}
	for (const a of apiGroups) {
		const g = out.find((x) => x.type === a.type && x.name === a.name);
		const meta = { id: a.id, displayName: a.displayName || a.name, visibility: a.visibility };
		if (g) Object.assign(g, meta);
		else out.push({ type: a.type, name: a.name, ...meta });
	}
	return out;
}

/** Add `favoriteId` (usr_/wrld_/avtr_) to the favorite group `group` (e.g. "group_0", "worlds1"). */
export async function addVrcFavorite(accountId, type, favoriteId, group) {
	if (!FAVORITE_TYPES.includes(type)) return { ok: false, error: 'bad favorite type' };
	const { status, data } = await api(accountId, 'favorites', {
		method: 'POST',
		body: { type, favoriteId, tags: group } // a plain string, exactly what VRCX sends
	});
	return { ok: status === 200, status, error: status === 200 ? undefined : errorMessage(status, data) };
}

/** Remove a favorite by the id of the favorited object (usr_/wrld_/avtr_), like VRCX. */
export async function removeVrcFavorite(accountId, favoriteId) {
	const { status, data } = await api(accountId, `favorites/${favoriteId}`, { method: 'DELETE' });
	return { ok: status === 200, status, error: status === 200 ? undefined : errorMessage(status, data) };
}
