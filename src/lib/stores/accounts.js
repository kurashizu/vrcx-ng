import { writable, derived, get } from 'svelte/store';
import { api, accountPath } from '$lib/client/api.js';
import { toasts } from './toast.js';

/**
 * @typedef {Object} AccountView
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {boolean} loggedIn
 * @property {boolean} connected
 * @property {any} currentUser   session user (id, displayName, location, status, avatar thumbnail…)
 * @property {string|null} lastError
 * @property {number|null} lastLoginAt
 */

export const accounts = writable(/** @type {AccountView[]} */ ([]));
export const accountsLoaded = writable(false);

export const accountById = derived(accounts, ($a) => new Map($a.map((a) => [a.id, a])));
export const loggedInAccounts = derived(accounts, ($a) => $a.filter((a) => a.loggedIn));
export const accountSummary = derived(accounts, ($a) => ({
	total: $a.length,
	loggedIn: $a.filter((a) => a.loggedIn).length,
	live: $a.filter((a) => a.connected).length
}));

/** Set when a login needs a 2FA code; the layout shows the dialog. */
export const twofaRequest = writable(/** @type {{ accountId: string, methods: string[] } | null} */ (null));

/**
 * Name to show for an account: a nickname given when adding it, else the VRChat
 * display name once logged in, else the login name.
 * @param {{ displayName?: string, username?: string, currentUser?: { displayName?: string } | null } | undefined} a
 */
export function accountLabel(a) {
	const nickname = a?.displayName && a.displayName !== a.username ? a.displayName : '';
	return nickname || a?.currentUser?.displayName || a?.displayName || a?.username || '';
}

/** `accountLabel` by account id (short id as a fallback). */
export function accountName(id) {
	return accountLabel(get(accountById).get(id)) || String(id || '').slice(0, 6);
}

export async function refreshAccounts() {
	const j = await api('/api/accounts');
	accounts.set(j.accounts || []);
	accountsLoaded.set(true);
	return j.accounts || [];
}

export async function addAccount(username, password, displayName) {
	const j = await api('/api/accounts', { method: 'POST', body: { username, password, displayName } });
	await refreshAccounts();
	return j.account;
}

export async function removeAccount(id) {
	try {
		await api('/api/accounts', { method: 'DELETE', query: { id } });
		await refreshAccounts();
		toasts.success('Account removed');
	} catch (err) {
		toasts.error(err.message || 'Remove failed');
	}
}

/**
 * Log an account in. When VRChat asks for a second factor the 2FA dialog is
 * raised through `twofaRequest`.
 * @returns {Promise<{ ok: boolean, requires2fa?: string[], error?: string }>}
 */
export async function loginAccount(id, opts = {}) {
	const res = await fetch(`${accountPath(id)}/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(opts)
	});
	const j = await res.json().catch(() => ({}));
	if (j.requires2fa) twofaRequest.set({ accountId: id, methods: j.requires2fa });
	else if (!res.ok) toasts.error(j.error || 'Login failed');
	await refreshAccounts().catch(() => {});
	return { ok: res.ok && !j.requires2fa, requires2fa: j.requires2fa, error: j.error };
}

export async function logoutAccount(id) {
	try {
		await api(`${accountPath(id)}/logout`, { method: 'POST' });
		await refreshAccounts();
		toasts.success('Logged out');
	} catch (err) {
		toasts.error(err.message || 'Logout failed');
	}
}

export async function reconnectAccount(id) {
	try {
		await api(`${accountPath(id)}/reconnect`, { method: 'POST' });
		toasts.success('Reconnect requested');
	} catch (err) {
		toasts.error(err.message || 'Reconnect failed');
	}
}
