import { writable } from 'svelte/store';
import { api } from '$lib/client/api.js';

/**
 * The two game clients on the game box: the main one (the player's) and the helper (temporary logins, relays).
 * @type {import('svelte/store').Writable<{ ok: boolean, error: string, clients: { kind: 'main' | 'aux', profile: number }[], profiles: Record<string, string|null>, auxProfiles: Record<string, string|null>, busyMain: boolean, busyAux: boolean, loginUntil: number, at: number }>}
 */
export const gameClients = writable({ ok: false, error: '', clients: [], profiles: {}, auxProfiles: {}, busyMain: false, busyAux: false, loginUntil: 0, at: 0 });

let inflight = null;
export function refreshGameClients() {
	if (inflight) return inflight;
	inflight = api('/api/game', { method: 'POST', body: { action: 'clients' } })
		.then((r) => gameClients.set({ ok: true, error: '', clients: r.clients || [], profiles: r.profiles || {}, auxProfiles: r.auxProfiles || {}, busyMain: !!r.busyMain, busyAux: !!r.busyAux, loginUntil: r.loginUntil || 0, at: Date.now() }))
		.catch((err) => gameClients.update((s) => ({ ...s, ok: false, error: err.message, clients: [] })))
		.finally(() => (inflight = null));
	return inflight;
}

/** Close one client at once and look again. */
export async function closeGameClient(kind) {
	await api('/api/game', { method: 'POST', body: { action: kind === 'aux' ? 'close-aux' : 'close-main' } });
	await refreshGameClients();
}
