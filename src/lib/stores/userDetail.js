import { writable } from 'svelte/store';

/** @type {import('svelte/store').Writable<{ accountId: string|null, userId: string|null }>} */
export const userDetailRequest = writable({ accountId: null, userId: null });

/** @type {import('svelte/store').Writable<any|null>} */
export const userDetailData = writable(null);
export const userDetailLoading = writable(false);
export const userDetailError = writable('');

export function openUserDetail(accountId, userId) {
	userDetailRequest.set({ accountId, userId });
}

export function closeUserDetail() {
	userDetailRequest.set({ accountId: null, userId: null });
	userDetailData.set(null);
	userDetailError.set('');
}
