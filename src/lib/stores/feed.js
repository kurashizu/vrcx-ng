import { writable, derived, get } from 'svelte/store';
import { FEED_TYPES } from '$lib/shared/feed.js';
import { settings } from './settings.js';
import { accounts } from './accounts.js';

const DEFAULT_MAX_ENTRIES = 1000;
const MAX_QUEUED = 500;

/** `feed.maxEntries` setting: how many entries the list keeps. */
function maxEntries() {
	return Math.max(100, Math.min(Number(get(settings)['feed.maxEntries']) || DEFAULT_MAX_ENTRIES, 5000));
}

/** @type {import('svelte/store').Writable<import('$lib/shared/feed.js').FeedEntry[]>} */
export const feed = writable([]);

/** currently selected account id filter (null = all) */
export const accountFilter = writable(/** @type {string|null} */ (null));

/** active feed type filters */
export const typeFilter = writable(/** @type {string[]} */ ([]));

/** free-text search */
export const searchText = writable('');

/** paused: hold new entries back (they are queued and appear on resume) */
export const paused = writable(false);

/** entries that arrived while paused, newest first */
let queued = [];

paused.subscribe((p) => {
	if (p || !queued.length) return;
	const held = queued;
	queued = [];
	feed.update((arr) => {
		const next = [...held, ...arr];
		const max = maxEntries();
		if (next.length > max) next.length = max;
		return next;
	});
});

export const filteredFeed = derived(
	[feed, accountFilter, typeFilter, searchText, settings, accounts],
	([$feed, $account, $types, $q, $settings, $accounts]) => {
		const q = $q.trim().toLowerCase();
		// Settings → "动态": which types are shown by default, and hiding the
		// accounts' own events. (Explicitly selecting a type chip always wins.)
		const enabled = $settings['feed.types'] || {};
		const hideSelf = !!$settings['ui.hideSelfInFeed'];
		const ownIds = hideSelf ? new Set($accounts.map((a) => a.currentUser?.id).filter(Boolean)) : null;
		return $feed.filter((e) => {
			if ($account && e.accountId !== $account) return false;
			if ($types.length > 0) {
				if (!$types.includes(e.type)) return false;
			} else if (enabled[e.type] === false) {
				return false;
			}
			if (hideSelf && (e.raw?.self || ownIds.has(e.userId))) return false;
			if (!q) return true;
			const hay =
				`${e.displayName || ''} ${e.accountDisplayName || ''} ${e.worldName || ''} ${e.location || ''} ${e.avatarName || ''} ${e.status || ''} ${e.bio || ''}`.toLowerCase();
			return hay.includes(q);
		});
	}
);

export function pushEntry(entry) {
	if (get(paused)) {
		queued.unshift(entry);
		if (queued.length > MAX_QUEUED) queued.length = MAX_QUEUED;
		return;
	}
	feed.update((arr) => {
		const next = [entry, ...arr];
		const max = maxEntries();
		if (next.length > max) next.length = max;
		return next;
	});
}

export function setInitial(entries) {
	queued = [];
	feed.set(entries || []);
}

export function clearFeed() {
	queued = [];
	feed.set([]);
}

export const feedTypes = FEED_TYPES;
