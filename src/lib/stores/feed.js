import { writable, derived, get } from 'svelte/store';
import { settings } from './settings.js';
import { accounts } from './accounts.js';

const DEFAULT_MAX = 1000;
const MAX_HELD = 500;

/** `feed.maxEntries` setting: how many entries the list keeps. */
function maxEntries() {
	return Math.max(100, Math.min(Number(get(settings)['feed.maxEntries']) || DEFAULT_MAX, 5000));
}

/** @type {import('svelte/store').Writable<import('$lib/shared/feed.js').FeedEntry[]>} */
export const feed = writable([]);

/** Selected account (null = all). */
export const accountFilter = writable(/** @type {string|null} */ (null));
/** Selected type chips; empty = whatever the "动态" settings enable. */
export const typeFilter = writable(/** @type {string[]} */ ([]));
export const searchText = writable('');

/** While paused, new entries are held back and appear on resume. */
export const paused = writable(false);
export const heldCount = writable(0);

/** @type {any[]} newest first */
let held = [];

function prepend(entries) {
	feed.update((arr) => {
		const next = [...entries, ...arr];
		const max = maxEntries();
		if (next.length > max) next.length = max;
		return next;
	});
}

paused.subscribe((p) => {
	if (p || !held.length) return;
	const batch = held;
	held = [];
	heldCount.set(0);
	prepend(batch);
});

export function pushEntry(entry) {
	if (get(paused)) {
		held.unshift(entry);
		if (held.length > MAX_HELD) held.length = MAX_HELD;
		heldCount.set(held.length);
		return;
	}
	prepend([entry]);
}

export function setInitial(entries) {
	held = [];
	heldCount.set(0);
	feed.set(entries || []);
}

export function clearFeed() {
	held = [];
	heldCount.set(0);
	feed.set([]);
}

export const filteredFeed = derived(
	[feed, accountFilter, typeFilter, searchText, settings, accounts],
	([$feed, $account, $types, $q, $settings, $accounts]) => {
		const q = $q.trim().toLowerCase();
		const enabled = $settings['feed.types'] || {};
		const hideSelf = !!$settings['ui.hideSelfInFeed'];
		const ownIds = hideSelf ? new Set($accounts.map((a) => a.currentUser?.id).filter(Boolean)) : null;
		return $feed.filter((e) => {
			if ($account && e.accountId !== $account) return false;
			// an explicitly selected type chip always wins over the settings
			if ($types.length) {
				if (!$types.includes(e.type)) return false;
			} else if (enabled[e.type] === false) {
				return false;
			}
			if (hideSelf && (e.raw?.self || ownIds.has(e.userId))) return false;
			if (!q) return true;
			const hay = `${e.displayName || ''} ${e.accountDisplayName || ''} ${e.worldName || ''} ${e.location || ''} ${e.avatarName || ''} ${e.status || ''} ${e.bio || ''}`.toLowerCase();
			return hay.includes(q);
		});
	}
);
