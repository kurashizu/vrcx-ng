import { writable, derived, get } from 'svelte/store';
import { toasts } from './toast.js';

/**
 * @typedef {Object} AccountView
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {boolean} loggedIn
 * @property {boolean} connected
 * @property {{id:string,displayName:string,currentAvatarThumbnailImageUrl?:string}|null} currentUser
 * @property {string|null} lastError
 * @property {number|null} lastLoginAt
 */

export const accounts = writable(/** @type {AccountView[]} */ ([]));
export const accountsLoaded = writable(false);

export const onlineCount = derived(accounts, ($a) => $a.filter((x) => x.connected).length);
export const loggedInCount = derived(accounts, ($a) => $a.filter((x) => x.loggedIn).length);

export async function refreshAccounts() {
	const r = await fetch('/api/accounts');
	const j = await r.json();
	accounts.set(j.accounts || []);
	accountsLoaded.set(true);
	return j.accounts || [];
}

export async function addAccount(username, password, displayName) {
	const r = await fetch('/api/accounts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password, displayName })
	});
	const j = await r.json();
	if (!r.ok) {
		toasts.error(j.error || 'Failed to add account');
		throw new Error(j.error);
	}
	await refreshAccounts();
	return j.account;
}

export async function removeAccount(id) {
	const r = await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
	if (!r.ok) {
		const j = await r.json().catch(() => ({}));
		toasts.error(j.error || 'Delete failed');
		return;
	}
	await refreshAccounts();
	toasts.success('Account removed');
}

/**
 * @returns {Promise<{ ok: boolean, requires2fa?: string[], user?: any, error?: string }>}
 */
export async function loginAccount(id, opts = {}) {
	const r = await fetch(`/api/accounts/${id}/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(opts)
	});
	const j = await r.json();
	if (!r.ok && !j.requires2fa) {
		toasts.error(j.error || 'Login failed');
	}
	await refreshAccounts();
	return j;
}

export async function logoutAccount(id) {
	const r = await fetch(`/api/accounts/${id}/logout`, { method: 'POST' });
	if (!r.ok) {
		const j = await r.json().catch(() => ({}));
		toasts.error(j.error || 'Logout failed');
		return;
	}
	await refreshAccounts();
	toasts.success('Logged out');
}

export async function reconnectAccount(id) {
	const r = await fetch(`/api/accounts/${id}/reconnect`, { method: 'POST' });
	const j = await r.json();
	if (!r.ok || !j.ok) {
		toasts.error(j.error || 'Reconnect failed');
		return;
	}
	toasts.success('Reconnect requested');
}

export function findAccount(id) {
	return get(accounts).find((a) => a.id === id);
}
