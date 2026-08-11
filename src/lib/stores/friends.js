import { writable, derived } from 'svelte/store';

/**
 * @typedef {{
 *   id: string,
 *   displayName: string,
 *   currentAvatarThumbnailImageUrl?: string,
 *   status?: string,
 *   statusDescription?: string,
 *   state?: 'online'|'active'|'offline',
 *   location?: string,
 *   platform?: string,
 *   last_platform?: string,
 *   lastSeen?: number,
 *   accountIds: string[]
 * }} FriendEntry
 */

/** @type {import('svelte/store').Writable<{ online: FriendEntry[], active: FriendEntry[], offline: FriendEntry[], total: number, byAccount: Record<string, number> }>} */
export const friendsData = writable({
	online: [],
	active: [],
	offline: [],
	total: 0,
	byAccount: {}
});

export const friendSearch = writable('');

/** which group is selected: 'all' | 'online' | 'active' | 'offline' */
export const friendGroupFilter = writable('all');

/** which account to filter friends by (null = all) */
export const friendAccountFilter = writable(/** @type {string|null} */ (null));

export const filteredFriends = derived(
	[friendsData, friendSearch, friendGroupFilter, friendAccountFilter],
	([$data, $search, $group, $account]) => {
		const q = $search.trim().toLowerCase();
		const matches = (f) => {
			if ($account && !f.accountIds.includes($account)) return false;
			if (!q) return true;
			return (
				(f.displayName || '').toLowerCase().includes(q) ||
				(f.location || '').toLowerCase().includes(q)
			);
		};
		const out = {
			online: $data.online.filter(matches),
			active: $data.active.filter(matches),
			offline: $data.offline.filter(matches)
		};
		out.total = out.online.length + out.active.length + out.offline.length;
		return out;
	}
);

export function setFriendsSnapshot(data) {
	friendsData.set(
		data || { online: [], active: [], offline: [], total: 0, byAccount: {} }
	);
}

/**
 * One-shot HTTP fetch of the current friend snapshot. Useful as a fallback
 * when SSE has not delivered any data yet (e.g. after a server restart
 * killed the prior EventSource and the page just mounted).
 *
 * Returns the data on success, throws on failure.
 */
export async function fetchFriendsSnapshot() {
	const r = await fetch('/api/friends');
	if (!r.ok) throw new Error(`HTTP ${r.status}`);
	const j = await r.json();
	setFriendsSnapshot(j);
	return j;
}
