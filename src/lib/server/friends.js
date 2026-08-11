import { getFriends, getFriendLists } from './vrchat.js';
import { getSession, setSession } from './accounts.js';
import { bus } from './bus.js';

/**
 * Per-account friend cache.
 *   Map<userId, Friend>
 *
 * VRCX's loadFriends sets `state` by intersecting with the currentUser's
 * onlineFriends / activeFriends arrays — because the `state` field returned
 * by /auth/user/friends is unreliable (especially right after login). We do
 * the same. See vrcx-team/VRCX src/api/friend.js
 *
 * @typedef {Object} Friend
 * @property {string} id
 * @property {string} displayName
 * @property {string} [currentAvatarThumbnailImageUrl]
 * @property {string} [status]                  // 'active'|'join me'|'busy'|'ask me'|'offline'
 * @property {string} [statusDescription]
 * @property {string} [bio]
 * @property {string} [state]                   // 'online'|'active'|'offline'
 * @property {string} [location]
 * @property {string} [worldId]
 * @property {string} [worldName]
 * @property {string} [platform]
 * @property {string} [last_platform]
 * @property {number} [lastSeen]
 */

/** @type {Map<string, Map<string, Friend>>} */
const cache = new Map();

/** @type {Map<string, boolean>} */
const fetching = new Map();

/**
 * Load (or refresh) the friend list for a single account.
 * @param {string} accountId
 */
export async function loadFriends(accountId) {
	if (fetching.get(accountId)) return;
	fetching.set(accountId, true);
	try {
		// VRChat's /auth/user/friends API quirk: with offline=true it returns ONLY
		// the offline subset; without it, it returns online+active. We need both.
		const [onlineList, offlineList, friendLists] = await Promise.all([
			getFriends(accountId, { n: 100 }),
			getFriends(accountId, { n: 100, offline: true }),
			getFriendLists(accountId)
		]);

		const activeSet = new Set(friendLists?.activeFriends || []);
		const onlineApiSet = new Set(friendLists?.onlineFriends || []);

		// Build a map keyed by id, deduping across the two lists
		const map = new Map();
		const ingest = (arr) => {
			for (const f of arr) {
				if (!f?.id || !f.displayName) continue;
				if (map.has(f.id)) continue; // already added from the other list
				map.set(f.id, f);
			}
		};
		ingest(onlineList);
		ingest(offlineList);

		// Now compute state for each
		for (const f of map.values()) {
			const norm = normalizeFriend(f, activeSet, onlineApiSet);
			map.set(f.id, norm);
		}

		// Resolve world names for friends currently online with a known location
		const { getWorldMeta } = await import('./worldCache.js');
		const worldIds = new Set();
		for (const f of map.values()) {
			if (f.state === 'online' && f.location && f.location !== 'offline' && f.location !== 'private') {
				const wid = f.location.split(':')[0];
				if (wid) worldIds.add(wid);
			}
		}
		await Promise.all(
			Array.from(worldIds).map(async (wid) => {
				const meta = await getWorldMeta(accountId, wid, { fetchOnMiss: true });
				if (!meta) return;
				for (const f of map.values()) {
					if (f.location?.split(':')[0] === wid) {
						map.set(f.id, { ...map.get(f.id), worldId: wid, worldName: meta.name });
					}
				}
			})
		);

		console.log(
			`[friends] ${accountId} loaded ${map.size} (online=${mapOf(map, 'online').length} active=${mapOf(map, 'active').length} offline=${mapOf(map, 'offline').length})`
		);

		// Merge with existing cache so pipeline events that arrived between WS
		// open and now aren't clobbered.
		const existing = cache.get(accountId);
		if (existing) {
			for (const [uid, prev] of existing) {
				if (!map.has(uid)) {
					map.set(uid, { ...prev, state: 'offline', lastSeen: Date.now() });
				} else if (prev.state === 'online' || prev.state === 'active') {
					const cur = map.get(uid);
					map.set(uid, {
						...cur,
						state: prev.state,
						location: prev.location || cur.location,
						platform: prev.platform || cur.platform
					});
				}
			}
		}
		cache.set(accountId, map);
		bus.emit('friends');
	} catch (err) {
		console.error(`[friends] load ${accountId} failed`, err.message);
	} finally {
		fetching.set(accountId, false);
	}
}

function mapOf(map, state) {
	const out = [];
	for (const v of map.values()) if (v.state === state) out.push(v);
	return out;
}

/**
 * Re-derive state for already-cached friends using a fresh online/active list.
 * Used when currentUser updates (e.g. via 'user-update' pipeline event).
 * @param {string} accountId
 * @param {{ activeFriends?: string[], onlineFriends?: string[] }} lists
 */
export function reconcileStates(accountId, lists) {
	const map = cache.get(accountId);
	if (!map) return;
	const activeSet = new Set(lists.activeFriends || []);
	const onlineSet = new Set(lists.onlineFriends || []);
	let changed = false;
	for (const f of map.values()) {
		const prev = f.state;
		const next = activeSet.has(f.id) ? 'active' : onlineSet.has(f.id) ? 'online' : 'offline';
		if (prev !== next) {
			f.state = next;
			if (next === 'offline') f.lastSeen = Date.now();
			changed = true;
		}
	}
	if (changed) scheduleFriendsEmit();
}

/**
 * Drop cache for an account (on logout / delete).
 * @param {string} accountId
 */
export function dropFriends(accountId) {
	if (cache.delete(accountId)) bus.emit('friends');
}

/**
 * Update a single friend's state (called from pipeline events).
 * @param {string} accountId
 * @param {string} userId
 * @param {Partial<Friend>} patch
 */
export function patchFriend(accountId, userId, patch) {
	const map = cache.get(accountId);
	if (!map) return;
	const existing = map.get(userId);
	if (!existing) {
		// Friend not in cache (login just happened and loadFriends is still
		// in-flight, or a new friend). Insert a minimal record so pipeline
		// events aren't lost.
		const minimal = normalizeFriend({ id: userId, displayName: userId, ...patch }, new Set(), new Set());
		map.set(userId, minimal);
		scheduleFriendsEmit();
		return;
	}
	const next = { ...existing, ...patch, id: userId };
	if (existing.state !== 'offline' && patch.state === 'offline') {
		next.lastSeen = Date.now();
	}
	map.set(userId, next);
	scheduleFriendsEmit();
}

/**
 * Update just the worldName/location for an online friend (called when a
 * world name is resolved after the friend-online/friend-location event).
 */
export function setFriendWorldName(accountId, userId, worldName) {
	const map = cache.get(accountId);
	if (!map) return;
	const existing = map.get(userId);
	if (!existing) return;
	map.set(userId, { ...existing, worldName });
	scheduleFriendsEmit();
}

/**
 * Upsert a friend we just learned about (e.g. a new friend-add event).
 * @param {string} accountId
 * @param {Friend} friend
 */
export function upsertFriend(accountId, friend) {
	if (!friend?.id) return;
	const map = cache.get(accountId);
	if (!map) return;
	const existing = map.get(friend.id);
	map.set(friend.id, { ...existing, ...friend });
	scheduleFriendsEmit();
}

let emitTimer = null;
function scheduleFriendsEmit() {
	if (emitTimer) return;
	emitTimer = setTimeout(() => {
		emitTimer = null;
		bus.emit('friends');
	}, 250);
}

/**
 * Aggregate all friends across all logged-in accounts.
 */
export function aggregate() {
	/** @type {Map<string, Friend & { accountIds: Set<string>, _state: string }>} */
	const map = new Map();
	const byAccount = {};

	for (const [accountId, friends] of cache) {
		const sess = getSession(accountId);
		if (!sess?.user) continue; // not logged in, skip
		byAccount[accountId] = friends.size;
		for (const f of friends.values()) {
			const existing = map.get(f.id);
			if (existing) {
				existing.accountIds.add(accountId);
				const rank = (s) => (s === 'online' ? 2 : s === 'active' ? 1 : 0);
				if (rank(f.state || 'offline') > rank(existing._state)) {
					Object.assign(existing, f, { _state: f.state || 'offline' });
				}
			} else {
				map.set(f.id, { ...f, accountIds: new Set([accountId]), _state: f.state || 'offline' });
			}
		}
	}

	/** @type {any[]} */
	const online = [];
	/** @type {any[]} */
	const active = [];
	/** @type {any[]} */
	const offline = [];

	for (const f of map.values()) {
		const flat = { ...f, accountIds: Array.from(f.accountIds) };
		delete flat._state;
		if (flat.state === 'online') online.push(flat);
		else if (flat.state === 'active') active.push(flat);
		else offline.push(flat);
	}

	online.sort((a, b) => a.displayName.localeCompare(b.displayName));
	active.sort((a, b) => a.displayName.localeCompare(b.displayName));
	offline.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

	return { online, active, offline, total: map.size, byAccount };
}

/**
 * @param {any} f
 * @param {Set<string>} activeSet
 * @param {Set<string>} onlineSet
 * @returns {Friend}
 */
function normalizeFriend(f, activeSet, onlineSet) {
	// Determine state from activeFriends/onlineFriends lists, falling back to
	// the friend record's `location` field (if non-empty/non-offline, the
	// friend is online somewhere). The API's per-friend `state` field is
	// unreliable.
	const state = activeSet.has(f.id)
		? 'active'
		: onlineSet.has(f.id) || (f.location && f.location !== 'offline')
			? 'online'
			: 'offline';

	const loc = f.location && f.location !== 'offline' ? f.location : '';
	const worldId = loc ? loc.split(':')[0] : '';
	return {
		id: f.id,
		displayName: f.displayName || f.id,
		currentAvatarThumbnailImageUrl: f.currentAvatarThumbnailImageUrl || '',
		status: f.status || 'offline',
		statusDescription: f.statusDescription || '',
		bio: f.bio || '',
		state,
		location: loc,
		worldId,
		worldName: '',
		platform: f.platform || '',
		last_platform: f.last_platform || '',
		lastSeen: state === 'offline' ? Date.now() : 0
	};
}
