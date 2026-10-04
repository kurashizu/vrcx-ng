import { writable, derived } from 'svelte/store';
import { api } from '$lib/client/api.js';

/**
 * @typedef {Object} Friend
 * @property {string} id
 * @property {string} displayName
 * @property {'online'|'active'|'offline'} state
 * @property {string} [status]
 * @property {string} [statusDescription]
 * @property {string} [location]
 * @property {string} [worldId]
 * @property {string} [worldName]
 * @property {string} [platform]
 * @property {string} [currentAvatar]
 * @property {string} [currentAvatarThumbnailImageUrl]
 * @property {number} [lastSeen]
 * @property {boolean} [vrcPlus]
 * @property {string[]} [tags]
 * @property {string} [developerType]
 * @property {string} [trustRank]
 * @property {string|null} [groupName]   local friend group
 * @property {string[]} accountIds       accounts that have this user as a friend
 */

const EMPTY = { online: [], active: [], offline: [], total: 0, byAccount: {}, self: [] };

/** Aggregated friend snapshot across all accounts (pushed over SSE). */
export const friendsData = writable(/** @type {{ online: Friend[], active: Friend[], offline: Friend[], total: number, byAccount: Record<string, number>, self: any[] }} */ (EMPTY));

export const friendList = derived(friendsData, ($d) => [...$d.online, ...$d.active, ...$d.offline]);

/** userId → friend; lets feed items, dialogs and menus resolve names / thumbnails / accounts. */
export const friendIndex = derived(friendList, ($list) => {
	/** @type {Map<string, Friend>} */
	const m = new Map();
	for (const f of $list) if (!m.has(f.id)) m.set(f.id, f);
	return m;
});

/** worldId → name, learned from friends that stand in the world (for places that only know the id). */
export const worldNames = derived(friendList, ($list) => {
	/** @type {Map<string, string>} */
	const m = new Map();
	for (const f of $list) if (f.worldId && f.worldName && !m.has(f.worldId)) m.set(f.worldId, f.worldName);
	return m;
});

export function setFriendsSnapshot(data) {
	friendsData.set(data ? { ...EMPTY, ...data } : EMPTY);
}

/** One-shot HTTP fetch of the snapshot (fallback while SSE has not delivered yet). */
export async function fetchFriendsSnapshot() {
	const j = await api('/api/friends');
	setFriendsSnapshot(j);
	return j;
}

/**
 * Re-fetch the snapshot while the store is still empty (right after a server
 * restart): starts at 3 s, backs off to 30 s, gives up after ~10 minutes so an
 * account without friends doesn't poll forever. Returns a stop function.
 */
export function startFriendsWatchdog() {
	let stopped = false;
	let delay = 3000;
	let empty = true;
	const unsub = friendsData.subscribe((d) => (empty = !(d.total > 0)));
	const giveUpAt = Date.now() + 10 * 60 * 1000;
	let timer;
	const tick = async () => {
		if (stopped || !empty || Date.now() > giveUpAt) return;
		await fetchFriendsSnapshot().catch(() => {});
		if (stopped) return;
		timer = setTimeout(tick, delay);
		delay = Math.min(Math.round(delay * 1.5), 30000);
	};
	timer = setTimeout(tick, 500);
	return () => {
		stopped = true;
		clearTimeout(timer);
		unsub();
	};
}

// ---- local friend groups (VIP buckets) ----

/** @type {import('svelte/store').Writable<{ groups: any[], members: Record<string, string[]> }>} */
export const friendGroups = writable({ groups: [], members: {} });

export async function loadFriendGroups() {
	try {
		const j = await api('/api/friend-groups');
		const members = {};
		for (const g of j.groups || []) members[g.name] = (j.members?.[g.name] || []).map((m) => m.userId);
		friendGroups.set({ groups: j.groups || [], members });
	} catch (err) {
		console.error('load friend groups', err);
	}
}

export async function setFriendGroupMember(groupName, userId, member) {
	await api('/api/friend-groups', {
		method: 'POST',
		body: { action: member ? 'addMember' : 'removeMember', groupName, userId }
	});
	await loadFriendGroups();
}
