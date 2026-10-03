import { getFriends, getFriendLists, getAvatar } from './vrchat.js';
import { getSession } from './accounts.js';
import { bus, backfillFeedNames } from './bus.js';
import { getGroupsForUsers } from './friendGroups.js';
import { getWorldMeta } from './worldCache.js';
import { getSetting } from './settings.js';
import { parseLocation } from '../shared/location.js';
import { trustLabelFromTags } from '../shared/trust.js';

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
 * @property {string} [location]                // wrld_x:inst | 'private' | 'traveling' | ''
 * @property {string} [travelingToLocation]
 * @property {string} [worldId]                 // only set for real wrld_ locations
 * @property {string} [worldName]
 * @property {string} [platform]
 * @property {string} [last_platform]
 * @property {number} [lastSeen]                // ms; when the friend was last seen (offline friends)
 * @property {number} [evtAt]                   // ms; last time a pipeline event touched this record
 */

/** @type {Map<string, Map<string, Friend>>} */
const cache = new Map();

/**
 * Cross-account displayName cache: userId -> displayName.
 *
 * Some websocket events (friend-online / friend-active) arrive without the
 * full user object, which made feed entries fall back to a bare usr_xxx.
 * We seed this map from every account's friend syncs and from any event
 * carrying a real name, then resolve names at feed-entry creation time.
 * @type {Map<string, string>}
 */
const globalNameCache = new Map();

function seedGlobalName(userId, name) {
	if (!userId || !name || name === userId) return;
	if (globalNameCache.get(userId) === name) return;
	globalNameCache.set(userId, name);
	// Patch already-buffered feed entries that still show the bare id.
	try {
		backfillFeedNames(userId, name);
	} catch {}
}

/**
 * Resolve a display name for a userId from any account's friend cache.
 * Returns '' if unknown so callers can fall back to the raw id.
 * @param {string} userId
 * @returns {string}
 */
export function lookupDisplayName(userId) {
	if (!userId) return '';
	const direct = globalNameCache.get(userId);
	if (direct) return direct;
	for (const map of cache.values()) {
		const f = map.get(userId);
		if (f?.displayName && f.displayName !== userId) {
			seedGlobalName(userId, f.displayName);
			return f.displayName;
		}
	}
	return '';
}

/** Real world id of a location string, '' for sentinels (private/traveling/offline/local). */
function worldIdOf(loc) {
	return typeof loc === 'string' && loc.startsWith('wrld_') ? loc.split(':')[0] : '';
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit(items, limit, fn) {
	let i = 0;
	const worker = async () => {
		while (i < items.length) {
			const item = items[i++];
			await fn(item).catch(() => {});
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** @type {Map<string, Promise<void>>} */
const loading = new Map();
/** @type {Map<string, { timer: NodeJS.Timeout, attempt: number }>} */
const retries = new Map();
const RESYNC_INTERVAL_MS = 60 * 60 * 1000;
let resyncTimer = null;

/**
 * Hourly full resync of every logged-in account (VRCX does the same): the
 * pipeline can silently miss events, so the cache is rebuilt from the API.
 */
function ensureResyncTimer() {
	if (resyncTimer) return;
	resyncTimer = setInterval(() => {
		let i = 0;
		for (const accountId of cache.keys()) {
			if (!getSession(accountId)?.user) continue;
			// stagger the accounts so they don't all hit the API at once
			setTimeout(() => loadFriends(accountId), i++ * 15000).unref?.();
		}
	}, RESYNC_INTERVAL_MS);
	resyncTimer.unref?.();
}

/**
 * Load (or refresh) the friend list for a single account. Safe to call
 * repeatedly: concurrent calls share one run, and every run is a full resync
 * (friends that are gone upstream are removed, fresh API data wins over the
 * cache except for pipeline events that arrived while the load was running).
 * Never rejects.
 * @param {string} accountId
 * @returns {Promise<void>}
 */
export function loadFriends(accountId) {
	const running = loading.get(accountId);
	if (running) return running;
	const p = doLoadFriends(accountId).finally(() => loading.delete(accountId));
	loading.set(accountId, p);
	return p;
}

async function doLoadFriends(accountId) {
	ensureResyncTimer();
	const startedAt = Date.now();
	try {
		// VRChat's /auth/user/friends API quirk: with offline=true it returns ONLY
		// the offline subset; without it, it returns online+active. We need both.
		// VRChat caps each request at 100 friends, so we must page through with
		// `offset` to get the full list (a 500+ friend list otherwise loses
		// everyone past the first page). 429s are retried inside api().
		const fetchAll = async (params) => {
			const out = [];
			let offset = 0;
			for (;;) {
				const page = await getFriends(accountId, { ...params, n: 100, offset });
				if (!Array.isArray(page)) break;
				out.push(...page);
				if (page.length < 100) break;
				offset += page.length;
			}
			return out;
		};
		const [onlineList, offlineList, friendLists] = await Promise.all([
			fetchAll({}),
			fetchAll({ offline: true }),
			getFriendLists(accountId)
		]);

		const activeSet = new Set(friendLists?.activeFriends || []);
		const onlineApiSet = new Set(friendLists?.onlineFriends || []);
		const allIds = new Set(friendLists?.friends || []);

		// Build a map keyed by id, deduping across the two lists
		const map = new Map();
		const ingest = (arr) => {
			for (const f of arr) {
				if (!f?.id || !f.displayName) continue;
				seedGlobalName(f.id, f.displayName);
				if (map.has(f.id)) continue; // already added from the other list
				map.set(f.id, f);
			}
		};
		ingest(onlineList);
		ingest(offlineList);

		// Now compute state for each
		for (const f of map.values()) {
			map.set(f.id, normalizeFriend(f, activeSet, onlineApiSet));
		}

		// Resolve world names for friends currently in a known world (bounded
		// concurrency; unknown worlds are negative-cached in worldCache).
		const worldIds = new Set();
		for (const f of map.values()) if (f.worldId) worldIds.add(f.worldId);
		const worldNames = new Map();
		await mapLimit([...worldIds], 5, async (wid) => {
			const meta = await getWorldMeta(accountId, wid, { fetchOnMiss: true });
			if (meta?.name) worldNames.set(wid, meta.name);
		});
		for (const f of map.values()) {
			if (f.worldId && worldNames.has(f.worldId)) f.worldName = worldNames.get(f.worldId);
		}

		console.log(
			`[friends] ${accountId} loaded ${map.size} (online=${mapOf(map, 'online').length} active=${mapOf(map, 'active').length} offline=${mapOf(map, 'offline').length})`
		);

		// Merge with the existing cache.
		const existing = cache.get(accountId);
		if (existing) {
			for (const [uid, prev] of existing) {
				const cur = map.get(uid);
				if (!cur) {
					// Missing from the fresh pages. Only drop it when VRChat's own
					// friend-id list confirms it is no longer a friend; otherwise
					// (partial data) keep what the pipeline knew.
					if (!(allIds.size > 0 && !allIds.has(uid))) map.set(uid, prev);
					continue;
				}
				if (prev.evtAt && prev.evtAt > startedAt) {
					// A pipeline event arrived while this load was running — it is
					// newer than what we fetched, so it wins.
					map.set(uid, {
						...cur,
						...prev,
						displayName: prev.displayName && prev.displayName !== uid ? prev.displayName : cur.displayName
					});
				} else if (cur.state === 'offline') {
					cur.lastSeen = Math.max(cur.lastSeen || 0, prev.lastSeen || 0);
				}
			}
		}
		cache.set(accountId, map);
		retries.delete(accountId);
		bus.emit('friends');
		// Kick off a bounded avatar-thumbnail backfill (private avatars often
		// come back without a thumbnail URL in the friend list payload).
		backfillAvatarThumbnails(accountId, 10).catch(() => {});
	} catch (err) {
		console.error(`[friends] load ${accountId} failed`, err.message);
		scheduleFriendsRetry(accountId);
	}
}

/**
 * After a failed loadFriends (often a DNS/network race during systemd boot, or
 * a rate limit), retry with exponential backoff (5s → 5min) so the friend list
 * eventually populates without a manual reconnect. Stops once the account is
 * logged out.
 */
function scheduleFriendsRetry(accountId) {
	if (retries.get(accountId)?.timer) return;
	const attempt = (retries.get(accountId)?.attempt ?? 0) + 1;
	const delay = Math.min(5000 * 2 ** (attempt - 1), 5 * 60 * 1000);
	const timer = setTimeout(() => {
		retries.set(accountId, { timer: null, attempt });
		if (!getSession(accountId)?.user) {
			retries.delete(accountId);
			return;
		}
		loadFriends(accountId);
	}, delay);
	timer.unref?.();
	retries.set(accountId, { timer, attempt });
}

function mapOf(map, state) {
	const out = [];
	for (const v of map.values()) if (v.state === state) out.push(v);
	return out;
}

/**
 * Re-derive state for already-cached friends using a fresh online/active list.
 * Used on (re)connect with the current user's onlineFriends / activeFriends.
 *
 * Important: VRChat does NOT include friends who are in a private world in the
 * `onlineFriends` array — that's the whole point of "private". But their
 * friend.location field is the string 'private', so we treat them as online.
 * Without BOTH lists we cannot tell "offline" from "missing data", so nothing
 * is changed. Friends a pipeline event touched in the last 15 s are left alone
 * (the REST lists can lag behind the websocket).
 *
 * @param {string} accountId
 * @param {{ activeFriends?: string[], onlineFriends?: string[] }} lists
 */
export function reconcileStates(accountId, lists) {
	const map = cache.get(accountId);
	if (!map) return;
	if (!Array.isArray(lists?.activeFriends) || !Array.isArray(lists?.onlineFriends)) return;
	const activeSet = new Set(lists.activeFriends);
	const onlineSet = new Set(lists.onlineFriends);
	const now = Date.now();
	let changed = false;
	for (const f of map.values()) {
		if (f.evtAt && now - f.evtAt < 15000) continue;
		const isPrivate = f.location === 'private';
		const next = activeSet.has(f.id)
			? 'active'
			: onlineSet.has(f.id) || isPrivate
				? 'online'
				: 'offline';
		if (f.state !== next) {
			f.state = next;
			if (next === 'offline') f.lastSeen = now;
			changed = true;
		}
	}
	if (changed) scheduleFriendsEmit();
}

/**
 * Resolve missing avatar thumbnails for friends whose `currentAvatar` is
 * known but whose `currentAvatarThumbnailImageUrl` came back empty.
 *
 * VRChat's /auth/user/friends (and the websocket user payloads) often leave
 * the thumbnail empty for private avatars; the avatar itself is still
 * fetchable for friends. Bounded to `limit` per call to stay polite.
 * @param {string} accountId
 * @param {number} [limit]
 * @returns {Promise<number>} number of thumbnails patched
 */
export async function backfillAvatarThumbnails(accountId, limit = 8) {
	const map = cache.get(accountId);
	if (!map) return 0;
	const targets = [];
	for (const [uid, f] of map) {
		if (f.currentAvatar && !f.currentAvatarThumbnailImageUrl) {
			targets.push([uid, f.currentAvatar]);
			if (targets.length >= limit) break;
		}
	}
	if (!targets.length) return 0;
	let patched = 0;
	for (const [uid, avatarId] of targets) {
		try {
			const av = await getAvatar(accountId, avatarId);
			if (av?.thumbnailImageUrl) {
				patchFriend(accountId, uid, { currentAvatarThumbnailImageUrl: av.thumbnailImageUrl });
				patched++;
			}
		} catch {
			// private/blocked avatar or rate limit: skip quietly
		}
	}
	return patched;
}

/**
 * Drop cache for an account (on logout / delete).
 * @param {string} accountId
 */
export function dropFriends(accountId) {
	const r = retries.get(accountId);
	if (r?.timer) clearTimeout(r.timer);
	retries.delete(accountId);
	if (cache.delete(accountId)) bus.emit('friends');
}

/**
 * The cached friend record of one account, or null. Used by the pipeline as
 * the "before" baseline when diffing friend updates.
 * @param {string} accountId
 * @param {string} userId
 * @returns {Friend|null}
 */
export function getCachedFriend(accountId, userId) {
	return cache.get(accountId)?.get(userId) || null;
}

/**
 * Update a single friend's state (called from pipeline events). Undefined
 * values are ignored, and a known name is never replaced by a bare user id.
 * @param {string} accountId
 * @param {string} userId
 * @param {Partial<Friend>} patch
 */
export function patchFriend(accountId, userId, patch) {
	const clean = {};
	for (const [k, v] of Object.entries(patch || {})) if (v !== undefined) clean[k] = v;
	if (!clean.displayName || clean.displayName === userId) delete clean.displayName;
	if (clean.displayName) seedGlobalName(userId, clean.displayName);
	const map = cache.get(accountId);
	if (!map) return;
	const now = Date.now();
	const existing = map.get(userId);
	if (!existing) {
		// Friend not in cache (login just happened and loadFriends is still
		// in-flight, or a new friend). Insert a minimal record so pipeline
		// events aren't lost.
		const minimal = normalizeFriend(
			{ id: userId, displayName: lookupDisplayName(userId) || userId, ...clean },
			new Set(),
			new Set()
		);
		minimal.evtAt = now;
		if (minimal.state === 'offline' && !minimal.lastSeen) minimal.lastSeen = now;
		map.set(userId, minimal);
		scheduleFriendsEmit();
		return;
	}
	const next = { ...existing, ...clean, id: userId, evtAt: now };
	if (clean.location !== undefined && clean.location !== existing.location) {
		// keep the derived world fields in step with the new location
		if (clean.worldId === undefined) next.worldId = worldIdOf(clean.location);
		if (clean.worldName === undefined) next.worldName = '';
	}
	if (existing.state !== 'offline' && clean.state === 'offline') {
		next.lastSeen = now;
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
	seedGlobalName(friend.id, friend.displayName);
	const map = cache.get(accountId);
	if (!map) return;
	const existing = map.get(friend.id);
	const defined = Object.fromEntries(Object.entries(friend).filter(([, v]) => v !== undefined));
	const merged = normalizeFriend({ ...existing, ...defined }, new Set(), new Set());
	merged.evtAt = Date.now();
	map.set(friend.id, merged);
	scheduleFriendsEmit();
}

/**
 * Remove a friend from the cache (e.g. friend-delete event).
 * @param {string} accountId
 * @param {string} userId
 */
export function removeFriend(accountId, userId) {
	const map = cache.get(accountId);
	if (!map) return;
	if (map.delete(userId)) scheduleFriendsEmit();
}

let emitTimer = null;
function scheduleFriendsEmit() {
	if (emitTimer) return;
	emitTimer = setTimeout(() => {
		emitTimer = null;
		bus.emit('friends');
	}, 250);
}

const stateRank = (s) => (s === 'online' ? 2 : s === 'active' ? 1 : 0);

/**
 * Search across all logged-in accounts' cached friends.
 * Matches displayName, note, userId (substring, case-insensitive).
 * @param {string} q  search query
 * @param {number} [limit=50]
 * @returns {Array<{userId, displayName, note, state, status, location, worldName, tags, developerType, accountIds}>}
 */
export function searchLocal(q, limit = 50) {
	if (!q || q.length < 1) return [];
	const needle = q.toLowerCase();
	/** @type {Map<string, any>} */
	const byId = new Map();
	for (const [accountId, friends] of cache) {
		for (const [userId, f] of friends) {
			const dn = (f.displayName || '').toLowerCase();
			const note = (f.note || '').toLowerCase();
			const id = (userId || '').toLowerCase();
			if (dn.includes(needle) || note.includes(needle) || id.includes(needle)) {
				const existing = byId.get(userId);
				if (existing) {
					existing.accountIds.push(accountId);
					if (stateRank(f.state || 'offline') > stateRank(existing.state)) {
						existing.state = f.state || 'offline';
					}
				} else {
					byId.set(userId, {
						userId,
						displayName: f.displayName,
						note: f.note,
						state: f.state || 'offline',
						status: f.status,
						location: f.location,
						worldName: f.worldName,
						trustRank: f.trustRank,
						tags: f.tags || [],
						developerType: f.developerType || '',
						userThumbnailUrl: f.currentAvatarThumbnailImageUrl || '',
						accountId,
						accountIds: [accountId]
					});
				}
			}
		}
	}
	// Sort: online first, then active, then offline; alphabetical within group
	const sorted = [...byId.values()].sort((a, b) => {
		const r = stateRank(b.state) - stateRank(a.state);
		if (r !== 0) return r;
		return (a.displayName || '').localeCompare(b.displayName || '');
	});
	return sorted.slice(0, limit);
}

/**
 * Parse a location into access type / owner. Same parser as the UI
 * (shared/location.js); exported under the name other modules import.
 */
export const parseLocationFull = parseLocation;

/**
 * Return all friends currently in a given world, one entry per friend (a
 * friend shared by several of the user's accounts is listed once with all
 * their `accountIds`), with the instance type and (for private / friends /
 * friends+ instances) the owner user id taken from the location qualifier.
 *
 * @param {string} worldId
 * @returns {Array<{userId, displayName, note, location, instanceId, instanceType, ownerUserId, accountId, accountIds}>}
 */
export function friendsInWorld(worldId) {
	if (!worldId) return [];
	/** @type {Map<string, any>} */
	const byUser = new Map();
	for (const [accountId, friends] of cache) {
		const sess = getSession(accountId);
		if (!sess?.user) continue; // skip logged-out accounts
		for (const f of friends.values()) {
			const loc = f.location || '';
			if (worldIdOf(loc) !== worldId) continue;
			const prev = byUser.get(f.id);
			if (prev) {
				prev.accountIds.push(accountId);
				continue;
			}
			const parsed = parseLocation(loc);
			byUser.set(f.id, {
				userId: f.id,
				displayName: f.displayName,
				note: f.note,
				location: loc,
				instanceId: parsed.instanceId || null,
				instanceType: parsed.accessType || 'public',
				accessTypeLabel: parsed.accessTypeLabel || 'public',
				ownerUserId: parsed.userId || null,
				platform: f.platform || '',
				accountId,
				accountIds: [accountId]
			});
		}
	}
	const out = [...byUser.values()];
	// Sort: invite-able first (private/friends/friends+), then public, then by name
	const rank = (t) => {
		if (t === 'invite' || t === 'invite+') return 0;
		if (t === 'friends') return 1;
		if (t === 'friends+') return 2;
		return 3;
	};
	out.sort((a, b) => {
		const r = rank(a.instanceType) - rank(b.instanceType);
		if (r !== 0) return r;
		return (a.displayName || '').localeCompare(b.displayName || '');
	});
	return out;
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
				const better =
					stateRank(f.state) > stateRank(existing._state) ||
					// equal state: a concrete location beats a 'private' / empty one
					(stateRank(f.state) === stateRank(existing._state) &&
						worldIdOf(f.location) &&
						!worldIdOf(existing.location));
				if (better) {
					Object.assign(existing, f, { _state: f.state || 'offline' });
				}
			} else {
				map.set(f.id, { ...f, accountIds: new Set([accountId]), _state: f.state || 'offline' });
			}
		}
	}

	// Bulk lookup: which group does each user belong to?
	const groups = getGroupsForUsers([...map.keys()]);

	/** @type {any[]} */
	const online = [];
	/** @type {any[]} */
	const active = [];
	/** @type {any[]} */
	const offline = [];

	for (const f of map.values()) {
		const flat = { ...f, accountIds: Array.from(f.accountIds), groupName: groups.get(f.id) || null };
		delete flat._state;
		delete flat.evtAt;
		if (flat.state === 'online') online.push(flat);
		else if (flat.state === 'active') active.push(flat);
		else offline.push(flat);
	}

	const byName = (a, b) => (a.displayName || '').localeCompare(b.displayName || '');
	online.sort(byName);
	active.sort(byName);
	offline.sort(getSetting('friend.sortOfflineBy') === 'name' ? byName : (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

	return {
		online,
		active,
		offline,
		total: map.size,
		byAccount,
		self: Array.from(getSelfLocations().values())
	};
}

/**
 * @param {any} f
 * @param {Set<string>} activeSet
 * @param {Set<string>} onlineSet
 * @returns {Friend}
 */
function normalizeFriend(f, activeSet, onlineSet) {
	// Prefer an explicit, valid state from the caller (e.g. the pipeline's
	// friend-active events carry state:'active' even though the location is
	// 'offline'). Only fall back to the activeFriends/onlineFriends lists and
	// the location field when no explicit state was given — those lists miss
	// friends beyond the API page size, and private-instance friends would
	// otherwise be misclassified as offline.
	const explicit = ['online', 'active', 'offline'].includes(f.state);
	const state = explicit
		? f.state
		: activeSet.has(f.id)
			? 'active'
			: onlineSet.has(f.id) || (f.location && f.location !== 'offline')
				? 'online'
				: 'offline';

	const loc = f.location && f.location !== 'offline' ? f.location : '';
	// VRChat marks private avatars with a thumbnail that equals the user's
	// iconUrl (a file that 404s for everyone). Swap it for the larger profile
	// image when that happens so the UI falls back cleanly.
	const thumbRaw = f.currentAvatarThumbnailImageUrl || '';
	const iconRaw = f.iconUrl || '';
	const thumbOk = thumbRaw && thumbRaw !== iconRaw ? thumbRaw : (f.imageUrl || f.iconUrl || '');
	// When the friend was last seen: the API's last_activity / last_login (an
	// event-derived value, kept by patchFriend/reconcile, takes precedence).
	const apiLastSeen = Date.parse(f.last_activity || f.last_login || '') || 0;
	return {
		id: f.id,
		displayName: f.displayName || f.id,
		currentAvatar: f.currentAvatar || '',
		currentAvatarThumbnailImageUrl: thumbOk,
		currentAvatarImageUrl: f.currentAvatarImageUrl || '',
		vrcPlus: !!f.vrcPlus,
		status: f.status || 'offline',
		statusDescription: f.statusDescription || '',
		bio: f.bio || '',
		state,
		location: loc,
		travelingToLocation: f.travelingToLocation || '',
		worldId: worldIdOf(loc),
		worldName: f.worldName || '',
		platform: f.platform || '',
		last_platform: f.last_platform || '',
		lastSeen: state === 'offline' ? (typeof f.lastSeen === 'number' && f.lastSeen ? f.lastSeen : apiLastSeen) : 0,
		trustRank: trustLabelFromTags(f.tags, f.developerType),
		developerType: f.developerType || '',
		tags: f.tags || [],
		note: f.note
	};
}

/**
 * Get the current location(s) of the logged-in user(s). Used for the
 * "same instance" section in the friend list.
 */
export function getSelfLocations() {
	/** @type {Map<string, { accountId: string, userId: string, displayName: string, location: string, worldName: string }>} */
	const out = new Map();
	for (const accountId of cache.keys()) {
		const sess = getSession(accountId);
		if (!sess?.user) continue;
		const loc = sess.user.location || '';
		if (loc && loc !== 'offline' && loc !== 'private' && loc !== 'traveling') {
			out.set(loc, {
				accountId,
				userId: sess.user.id || '',
				displayName: sess.user.displayName || accountId,
				location: loc,
				worldName: '' // could be enriched via worldCache later
			});
		}
	}
	return out;
}
