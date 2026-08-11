import { writable } from 'svelte/store';

/**
 * @typedef {Object} UserDetailRequest
 * @property {string|null} accountId          currently selected account for actions
 * @property {string[]    } accountIds       all accounts that have this user as a friend (for picker)
 * @property {string|null} userId
 * @property {string|null} [displayName]     optional, for instant render before API loads
 */

/** @type {import('svelte/store').Writable<UserDetailRequest>} */
export const userDetailRequest = writable({
	accountId: null,
	accountIds: [],
	userId: null,
	displayName: ''
});

/** @type {import('svelte/store').Writable<any|null>} */
export const userDetailData = writable(null);
export const userDetailLoading = writable(false);
export const userDetailError = writable('');

/**
 * Open the user detail dialog.
 *
 * @param {string|string[]} accountIdOrIds  either a single accountId or an
 *   array of candidates. The first is treated as the active one.
 * @param {string} userId
 * @param {string} [displayName]
 */
export function openUserDetail(accountIdOrIds, userId, displayName = '') {
	const accountIds = Array.isArray(accountIdOrIds)
		? accountIdOrIds.slice()
		: accountIdOrIds
			? [accountIdOrIds]
			: [];
	const accountId = accountIds[0] || null;
	userDetailRequest.set({ accountId, accountIds, userId, displayName });
}

export function closeUserDetail() {
	userDetailRequest.set({ accountId: null, accountIds: [], userId: null, displayName: '' });
	userDetailData.set(null);
	userDetailError.set('');
}

/**
 * Switch the active account for actions.
 * @param {string} accountId
 */
export function setActiveAccount(accountId) {
	userDetailRequest.update((r) => {
		if (!r.accountIds.includes(accountId)) return r;
		return { ...r, accountId };
	});
}
