import { writable } from 'svelte/store';
import { api } from '$lib/client/api.js';

/** Bumped whenever the server reports a notification change (new / seen / dismissed). */
export const notificationsTick = writable(0);

/** Unseen notifications across all accounts (the sidebar badge). */
export const unseenCount = writable(0);

export async function refreshUnseen() {
	try {
		// only the per-account unseen counts are needed, not the notifications
		const j = await api('/api/notifications', { query: { onlyUnseen: true, limit: 1 } });
		unseenCount.set(Object.values(j.unseen || {}).reduce((a, b) => a + b, 0));
	} catch {}
}

/** Keep `unseenCount` fresh: on every server tick, plus a slow safety-net poll. */
export function startUnseenCounter() {
	const unsub = notificationsTick.subscribe(() => {
		refreshUnseen();
		refreshInvites();
	});
	const id = setInterval(() => document.visibilityState === 'visible' && (refreshUnseen(), refreshInvites()), 60000);
	return () => {
		unsub();
		clearInterval(id);
	};
}

/**
 * Invites our accounts have received, by instance: { accountId, location, from, fromId, at }.
 * An invite lets that account open the instance whatever its access type.
 */
export const receivedInvites = writable(/** @type {{ accountId: string, location: string, from: string, fromId: string, at: number }[]} */ ([]));

export async function refreshInvites() {
	try {
		const j = await api('/api/notifications', { query: { limit: 300 } });
		receivedInvites.set(
			(j.notifications || [])
				.filter((n) => n.type === 'invite' && n.worldId && n.instanceId && n.accountId)
				.map((n) => ({ accountId: n.accountId, location: `${n.worldId}:${n.instanceId}`, from: n.senderDisplayName || '', fromId: n.senderUserId || '', at: n.createdAt || 0 }))
		);
	} catch {}
}
