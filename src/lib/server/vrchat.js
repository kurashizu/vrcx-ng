import { setSession, getSession, getAccount } from './accounts.js';

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

/**
 * Set of accountIds currently being re-logged-in. Prevents infinite loops when
 * the relogin itself returns 401 (e.g. needs 2FA).
 */
const _reloginInFlight = new Set();

/**
 * Try to silently re-authenticate using the stored password. Only succeeds if
 * the account doesn't have 2FA required. If 2FA is required, we surface an
 * error to the client via lastError so they can re-login manually.
 * @param {string} accountId
 * @returns {Promise<boolean>} true if re-auth succeeded
 */
async function attemptRelogin(accountId) {
	if (_reloginInFlight.has(accountId)) return false;
	_reloginInFlight.add(accountId);
	try {
		const acct = getAccount(accountId);
		if (!acct?.username || !acct?.password) {
			console.log(`[vrchat] cannot relogin ${accountId}: no stored credentials`);
			return false;
		}
		console.log(`[vrchat] attempting silent relogin for ${accountId}`);
		// Clear stale cookies first to avoid confusion
		setSession(accountId, { cookie: '', lastError: null });
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
	} finally {
		// Don't release immediately — give the retry some time. Small delay.
		setTimeout(() => _reloginInFlight.delete(accountId), 10000);
	}
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
 * @param {boolean} [opts._retried] internal: marks a request as already-retried
 * @returns {Promise<{ status: number, data: any }>}
 */
export async function api(accountId, path, opts = {}) {
	const doFetch = async () => {
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
	};

	const res = await doFetch();

	// Auto-relogin on 401 (auth cookie expired / VRC rotated it).
	// - Skip if the caller opted out (e.g. login itself)
	// - Skip if already retried (avoid loop)
	// - Only attempt if a stored password exists
	if (
		res.status === 401 &&
		!opts.skipAuth &&
		!opts._retried &&
		!_reloginInFlight.has(accountId)
	) {
		const ok = await attemptRelogin(accountId);
		if (ok) {
			return await doFetch().then((r) => r); // re-fetch with new cookie
		}
	}

	return res;
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
	const msg = data?.error?.message || data?.error || `HTTP ${status}`;
	return { ok: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) };
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
	const { status, data } = await api(accountId, 'avatars', {
		params: { userId, n: 50, sort: 'updated', order: 'descending' }
	});
	if (status === 200) return data;
	return [];
}

/**
 * User's worlds
 * @param {string} accountId
 * @param {string} userId
 */
export async function getUserWorlds(accountId, userId) {
	const { status, data } = await api(accountId, 'worlds', {
		params: { userId, n: 50, sort: 'updated', order: 'descending' }
	});
	if (status === 200) return data;
	return [];
}

/**
 * VRChat doesn't expose a per-user badges endpoint; the current user
 * object carries its own `badges` array, so we read it from there.
 */
export async function getUserBadges(accountId, userId) {
	const { status, data } = await api(accountId, `users/${userId}`);
	if (status === 200 && Array.isArray(data?.badges)) return data.badges;
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
 * Update the account's own profile (bio, status, statusDescription,
 * bioLinks, pronouns). PUT /users/:id with the session user's id.
 * @param {string} accountId
 * @param {object} params allowed: bio, bioLinks, status, statusDescription, pronouns
 */
export async function updateOwnProfile(accountId, params) {
	const sess = getSession(accountId);
	const userId = sess?.user?.id || sess?.userId;
	if (!userId) return { ok: false, error: 'not logged in' };
	const { status, data } = await api(accountId, `users/${userId}`, {
		method: 'PUT',
		body: params
	});
	return { ok: status === 200, status, data };
}

export async function sendFriendRequest(accountId, userId) {
	const { status, data } = await api(accountId, `user/${userId}/friendRequest`, {
		method: 'POST'
	});
	return { ok: status === 200, status, data };
}

/**
 * Invite a friend to join a specific instance.
 * @param {string} accountId
 * @param {string} userId
 * @param {string} location  e.g. "wrld_xxx:12345"
 * @param {string} [message]
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function sendInvite(accountId, userId, location, message = '') {
	// VRChat rejects freeform invite messages from regular users — send the
	// instance location only (matching VRCX's payload).
	const body = { instanceId: location };
	if (message) body.message = message;
	const { status, data } = await api(accountId, `invite/${userId}`, {
		method: 'POST',
		body
	});
	if (status === 200) return { ok: true, data };
	return { ok: false, status, error: data?.error?.message || `HTTP ${status}` };
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
	return { ok: status === 200, data: data || [] };
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
	return { ok: status === 200, data: data || [] };
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
	return { ok: status === 200, data: data || [] };
}

/**
 * Fetch the per-account player moderation lists (mute / block / unmute / unblock).
 * Returns an array of { id, type, created: ISO, sourceUserId, targetDisplayName,
 * targetUserId, targetThumbnailImageUrl }.
 *
 * @param {string} accountId
 * @param {string} [type]  one of 'mute' | 'block' | 'unmute' | 'unblock'
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

export async function getPlayerModerations(accountId, type) {
	const q = type ? `?type=${encodeURIComponent(type)}` : '';
	const { status, data } = await api(accountId, `auth/user/playermoderations${q}`);
	return { ok: status === 200, data: data || [] };
}

/**
 * Create a new instance on the current user's account.
 * @param {string} accountId
 * @param {{
 *   worldId: string,
 *   type?: 'public'|'friends'|'hidden'|'private',
 *   canRequestInvite?: boolean,
 *   region?: 'us'|'use'|'eu'|'jp',
 *   groupId?: string,
 *   groupAccessType?: 'public'|'plus'|'members',
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
 */
export async function selfInvite(accountId, location) {
	// Match VRCX: VRChat's invite/myself/to endpoint expects an (optionally
	// empty) JSON body. Without one, some instances / WAF rules reject the
	// request as malformed even though the path looks fine.
	const { status, data } = await api(accountId, `invite/myself/to/${location}`, {
		method: 'POST',
		body: {},
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
