import { setSession, getSession } from './accounts.js';

const API_BASE = 'https://api.vrchat.cloud/api/1';
const WS_BASE = 'wss://pipeline.vrchat.cloud';

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 VRCActivity/0.1';

/**
 * Minimal VRChat REST client. Each "session" is identified by an accountId and
 * uses a cookie jar stored server-side (auth= cookie).
 */

function basicAuthHeader(username, password) {
	return 'Basic ' + Buffer.from(`${encodeURIComponent(username)}:${encodeURIComponent(password)}`).toString('base64');
}

function parseSetCookie(setCookie) {
	if (!setCookie) return [];
	return setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/).map((s) => s.trim());
}

function extractCookieFromSetCookie(setCookieArr, name) {
	for (const c of setCookieArr) {
		const m = c.match(new RegExp(`^${name}=([^;]+)`));
		if (m) return `${name}=${m[1]}`;
	}
	return null;
}

function cookieHeaderFromJar(jar) {
	if (!jar) return undefined;
	return jar
		.split(';')
		.map((c) => c.trim())
		.filter(Boolean)
		.join('; ');
}

function updateJar(jar, setCookieArr) {
	if (!setCookieArr?.length) return jar;
	const map = new Map(
		(jar || '')
			.split(';')
			.map((c) => c.trim())
			.filter(Boolean)
			.map((c) => {
				const idx = c.indexOf('=');
				return [c.slice(0, idx), c.slice(idx + 1)];
			})
	);
	for (const c of setCookieArr) {
		const idx = c.indexOf('=');
		if (idx < 0) continue;
		const k = c.slice(0, idx);
		const v = c.slice(idx + 1).split(';')[0];
		if (k.startsWith('__')) continue; // ignore __cf_bm / __ddg* etc
		map.set(k, v);
	}
	return Array.from(map.entries())
		.map(([k, v]) => `${k}=${v}`)
		.join('; ');
}

function getJar(accountId) {
	const sess = getSession(accountId);
	return sess?.cookie || null;
}

function persistCookie(accountId, jar) {
	if (!jar) return;
	setSession(accountId, { cookie: jar });
}

/**
 * Low-level fetch wrapper.
 * @param {string} accountId
 * @param {string} path
 * @param {object} [opts]
 * @returns {Promise<{ status: number, data: any }>}
 */
export async function api(accountId, path, opts = {}) {
	const url = path.startsWith('http') ? path : `${API_BASE}/${path.replace(/^\//, '')}`;
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
		method: opts.method || 'GET',
		headers,
		body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined
	});

	// update cookie jar from response
	const setCookie = res.headers.getSetCookie?.() ?? parseSetCookie(res.headers.get('set-cookie'));
	if (setCookie.length) {
		const jar = updateJar(getJar(accountId), setCookie);
		persistCookie(accountId, jar);
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

	return { status: res.status, data };
}

/* ---------------------------- public API ---------------------------- */

/**
 * Try to log in with Basic auth. On success the cookie is persisted.
 * @param {string} accountId
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ ok: boolean, user?: any, requires2fa?: string[], error?: string }>}
 */
export async function login(accountId, username, password) {
	const { status, data } = await api(accountId, 'auth/user', {
		method: 'GET',
		skipAuth: true,
		headers: { Authorization: basicAuthHeader(username, password) }
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
	const msg = data?.error?.message || data?.error || `HTTP ${status}`;
	return { ok: false, error: typeof msg === 'string' ? msg.replace(/^"|"$/g, '') : JSON.stringify(msg) };
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
	const { status, data } = await api(accountId, endpoint, {
		method: 'POST',
		body: { code }
	});
	if (status === 200) {
		// After verification we can fetch the actual user
		const me = await api(accountId, 'auth/user');
		if (me.status === 200 && me.data && !me.data.error) {
			setSession(accountId, { user: me.data, lastLoginAt: Date.now(), lastError: null });
			return { ok: true, user: me.data };
		}
		return { ok: true, user: data };
	}
	const msg = data?.error?.message || data?.error || `HTTP ${status}`;
	return { ok: false, error: typeof msg === 'string' ? msg.replace(/^"|"$/g, '') : JSON.stringify(msg) };
}

/**
 * Refresh the current user (also validates the cookie is still alive).
 * @param {string} accountId
 */
export async function getCurrentUser(accountId) {
	const { status, data } = await api(accountId, 'auth/user');
	if (status === 200 && data && !data.error) {
		setSession(accountId, { user: data });
		return data;
	}
	return null;
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
 * @returns {Promise<{ onlineFriends: string[], activeFriends: string[], offlineFriends?: string[] } | null>}
 */
export async function getFriendLists(accountId) {
	const { status, data } = await api(accountId, 'auth/user');
	if (status !== 200 || !data || data.error) return null;
	return {
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
 * User's avatars
 * @param {string} accountId
 * @param {string} userId
 */
export async function getUserAvatars(accountId, userId) {
	const { status, data } = await api(accountId, `users/${userId}/avatars`, { params: { n: 50 } });
	if (status === 200) return data;
	return [];
}

/**
 * User's worlds
 * @param {string} accountId
 * @param {string} userId
 */
export async function getUserWorlds(accountId, userId) {
	const { status, data } = await api(accountId, `users/${userId}/worlds`, { params: { n: 50 } });
	if (status === 200) return data;
	return [];
}

/**
 * User badges
 * @param {string} accountId
 * @param {string} userId
 */
export async function getUserBadges(accountId, userId) {
	const { status, data } = await api(accountId, `users/${userId}/badges`);
	if (status === 200) return data;
	return [];
}

/**
 * Add player moderation (mute / block / unmute / unblock)
 * @param {string} accountId
 * @param {string} moderatedUserId
 * @param {'mute'|'block'|'unmute'|'unblock'} type
 */
export async function addModeration(accountId, moderatedUserId, type) {
	// VRChat's current API expects the field name to be `moderated` (just the user id)
	return api(accountId, 'auth/user/playermoderations', {
		method: 'POST',
		body: { moderated: moderatedUserId, type }
	});
}

/**
 * Send a request-invite to a user (asks them to invite you to their instance)
 * @param {string} accountId
 * @param {string} userId
 * @param {string} [message]
 */
export async function sendRequestInvite(accountId, userId, message) {
	const { status, data } = await api(accountId, `requestInvite/${userId}`, {
		method: 'POST',
		body: { requestMessage: message || '' }
	});
	if (status === 200) return { ok: true, data };
	return { ok: false, status, error: data?.error?.message || `HTTP ${status}` };
}

/**
 * Send a friend invite (request)
 * @param {string} accountId
 * @param {string} userId
 */
export async function sendFriendRequest(accountId, userId) {
	const { status, data } = await api(accountId, `user/${userId}/friendRequest`, {
		method: 'POST'
	});
	return { ok: status === 200, status, data };
}
