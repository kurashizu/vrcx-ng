import { writable, derived } from 'svelte/store';
import { accounts } from './accounts.js';
import { friendsData } from './friends.js';

/** True once the first SSE snapshot has arrived. */
export const synced = writable(false);

/**
 * "Connecting…" while the first snapshot is pending, or while no friend data
 * exists yet but some logged-in account is still connecting. Pages show this
 * instead of a misleading "no data" empty state.
 */
export const connecting = derived([synced, accounts, friendsData], ([$s, $a, $f]) => !$s || ($f.total === 0 && $a.some((x) => x.loggedIn && !x.connected)));
