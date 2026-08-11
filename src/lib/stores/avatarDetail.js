import { writable } from 'svelte/store';

/** @type {import('svelte/store').Writable<{ accountId: string|null, avatarId: string|null }>} */
export const avatarDetailRequest = writable({ accountId: null, avatarId: null });

/**
 * Open the avatar detail dialog.
 * @param {string} avatarId
 * @param {string} [accountId]  which account's cookie to use as the API caller
 */
export function openAvatarDetail(avatarId, accountId = null) {
	avatarDetailRequest.set({ accountId, avatarId });
}

export function closeAvatarDetail() {
	avatarDetailRequest.set({ accountId: null, avatarId: null });
}
