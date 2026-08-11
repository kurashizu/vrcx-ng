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

/**
 * userId -> displayName, built from the current snapshot. Lets feed items
 * (and anything else) resolve a name when an entry only carries a raw usr_id.
 * @type {import('svelte/store').Readable<Map<string, string>>}
 */
export const friendNameById = derived(friendsData, ($data) => {
	const m = new Map();
	for (const list of [$data.online, $data.active, $data.offline]) {
		for (const f of list) {
			if (f?.displayName && f.displayName !== f.id && !m.has(f.id)) {
				m.set(f.id, f.displayName);
			}
		}
	}
	return m;
});

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

/**
 * Start a watchdog that periodically refetches the friend snapshot when
 * the store is still empty. Runs at most once every 3 s and stops as soon
 * as the store contains data.
 *
 * Returns a stop() function to cancel the watchdog.
 */
export function startEmptyFriendsWatchdog() {
	let cancelled = false;
	const tick = async () => {
		if (cancelled) return;
		let empty = true;
		const unsub = friendsData.subscribe((d) => {
			empty = !(d?.total > 0);
		});
		unsub();
		if (!empty) return;
		try {
			await fetchFriendsSnapshot();
		} catch {
			/* keep trying */
		}
		if (!cancelled) setTimeout(tick, 3000);
	};
	setTimeout(tick, 500);
	return () => {
		cancelled = true;
	};
}
