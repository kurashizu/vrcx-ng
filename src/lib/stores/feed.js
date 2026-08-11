import { writable, derived, get } from 'svelte/store';
import { FEED_TYPES } from '$lib/shared/feed.js';

const MAX_ENTRIES = 1000;

/** @type {import('svelte/store').Writable<import('$lib/shared/feed.js').FeedEntry[]>} */
export const feed = writable([]);

/** currently selected account id filter (null = all) */
export const accountFilter = writable(/** @type {string|null} */ (null));

/** active feed type filters */
export const typeFilter = writable(/** @type {string[]} */ ([]));

/** free-text search */
export const searchText = writable('');

/** paused: don't auto-insert new entries */
export const paused = writable(false);

export const filteredFeed = derived(
	[feed, accountFilter, typeFilter, searchText],
	([$feed, $account, $types, $q]) => {
		const q = $q.trim().toLowerCase();
		return $feed.filter((e) => {
			if ($account && e.accountId !== $account) return false;
			if ($types.length > 0 && !$types.includes(e.type)) return false;
			if (!q) return true;
			const hay =
				`${e.displayName || ''} ${e.accountDisplayName || ''} ${e.worldName || ''} ${e.location || ''} ${e.avatarName || ''} ${e.status || ''} ${e.bio || ''}`.toLowerCase();
			return hay.includes(q);
		});
	}
);

export function pushEntry(entry) {
	if (get(paused)) return;
	feed.update((arr) => {
		const next = [entry, ...arr];
		if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
		return next;
	});
}

export function setInitial(entries) {
	feed.set(entries || []);
}

export function clearFeed() {
	feed.set([]);
}

export const feedTypes = FEED_TYPES;
