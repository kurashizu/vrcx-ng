/**
 * 5-minute cache of the assembled user-detail payload, keyed per (account, user)
 * — one dialog open is one set of VRChat requests. Anything that changes what
 * the dialog shows (a note, a friend request, …) should invalidate its entry.
 */
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

/** @type {Map<string, { t: number, data: any }>} */
const cache = new Map();

const keyOf = (accountId, userId) => `${accountId}:${userId}`;

export function getCachedUserDetail(accountId, userId) {
	const k = keyOf(accountId, userId);
	const entry = cache.get(k);
	if (!entry) return null;
	if (Date.now() - entry.t > TTL_MS) {
		cache.delete(k);
		return null;
	}
	return entry.data;
}

export function setCachedUserDetail(accountId, userId, data) {
	cache.set(keyOf(accountId, userId), { t: Date.now(), data });
	if (cache.size > MAX_ENTRIES) {
		const first = cache.keys().next().value;
		if (first) cache.delete(first);
	}
}

export function invalidateUserDetail(accountId, userId) {
	cache.delete(keyOf(accountId, userId));
}
