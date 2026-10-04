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
	const unsub = notificationsTick.subscribe(() => refreshUnseen());
	const id = setInterval(() => document.visibilityState === 'visible' && refreshUnseen(), 60000);
	return () => {
		unsub();
		clearInterval(id);
	};
}
