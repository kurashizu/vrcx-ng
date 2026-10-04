import { writable, get } from 'svelte/store';
import { friendIndex } from './friends.js';
import { accounts } from './accounts.js';

/**
 * Detail dialogs (user / world / avatar) form a stack: opening a world from a
 * user dialog layers it on top, and closing it returns to the user. The
 * OverlayHost renders the stack; Esc and the backdrop close the top entry.
 *
 * @typedef {{ id: number, kind: 'user'|'world'|'avatar', key: string, [k: string]: any }} Overlay
 */
export const overlays = writable(/** @type {Overlay[]} */ ([]));

const MAX_DEPTH = 6;
let seq = 0;

function push(entry) {
	overlays.update((stack) => {
		const top = stack.at(-1);
		if (top && top.kind === entry.kind && top.key === entry.key) return stack;
		const next = [...stack, { id: ++seq, ...entry }];
		return next.length > MAX_DEPTH ? next.slice(-MAX_DEPTH) : next;
	});
}

export const closeOverlay = () => overlays.update((s) => s.slice(0, -1));
export const closeAllOverlays = () => overlays.set([]);

/** Any logged-in account — enough for look-ups that don't depend on friendship. */
export function defaultAccountId() {
	return get(accounts).find((a) => a.loggedIn)?.id || '';
}

/**
 * Open the user dialog. Accounts that have the user as a friend are tried
 * first (so friend actions show up); `accountId` is the caller's preference.
 * @param {string} userId
 * @param {{ accountId?: string, name?: string }} [hint]
 */
export function openUser(userId, { accountId = '', name = '' } = {}) {
	if (!userId) return;
	const friend = get(friendIndex).get(userId);
	let ids = friend?.accountIds ? [...friend.accountIds] : [];
	if (accountId) ids = [accountId, ...ids.filter((x) => x !== accountId)];
	if (!ids.length && defaultAccountId()) ids = [defaultAccountId()];
	push({ kind: 'user', key: userId, userId, accountIds: ids, name: name || friend?.displayName || '' });
}

/** @param {string} worldId @param {string} [accountId] */
export function openWorld(worldId, accountId = '') {
	if (!worldId) return;
	push({ kind: 'world', key: worldId, worldId, accountId: accountId || defaultAccountId() });
}

/** @param {string} avatarId @param {string} [accountId] */
export function openAvatar(avatarId, accountId = '') {
	if (!avatarId) return;
	push({ kind: 'avatar', key: avatarId, avatarId, accountId: accountId || defaultAccountId() });
}

// ---- app-level panels ----
export const notificationsOpen = writable(false);
export const addAccountOpen = writable(false);

// ---- context menu ----
/** @type {import('svelte/store').Writable<null | { x: number, y: number, header?: { title: string, subtitle?: string }, items: any[] }>} */
export const contextMenu = writable(null);
export const showContextMenu = (opts) => contextMenu.set(opts);
export const hideContextMenu = () => contextMenu.set(null);

// ---- promise-based confirm (replaces window.confirm) ----
export const confirmRequest = writable(/** @type {null | { message: string, okLabel: string, danger: boolean, resolve: (ok: boolean) => void }} */ (null));

/** @returns {Promise<boolean>} */
export function askConfirm(message, { okLabel = '确定', danger = false } = {}) {
	get(confirmRequest)?.resolve(false);
	return new Promise((resolve) => confirmRequest.set({ message, okLabel, danger, resolve }));
}

export function answerConfirm(ok) {
	const req = get(confirmRequest);
	confirmRequest.set(null);
	req?.resolve(ok);
}
