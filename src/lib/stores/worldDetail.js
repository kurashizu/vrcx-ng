import { writable } from 'svelte/store';

/** @type {import('svelte/store').Writable<{ accountId: string|null, worldId: string|null }>} */
export const worldDetailRequest = writable({ accountId: null, worldId: null });

/**
 * Open the world detail dialog.
 * @param {string} worldId
 * @param {string} [accountId]  which account's cookie to use as the API caller
 */
export function openWorldDetail(worldId, accountId = null) {
	worldDetailRequest.set({ worldId, accountId });
}

export function closeWorldDetail() {
	worldDetailRequest.set({ worldId: null, accountId: null });
}
