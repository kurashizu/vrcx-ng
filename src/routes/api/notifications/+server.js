import { json } from '@sveltejs/kit';
import { list, markSeen, markSeenIds, getNotification, dismiss, dismissAll, unseenCounts } from '$lib/server/notifications.js';
import { seeNotification } from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';
import { bus } from '$lib/server/bus.js';
import { bulkLookup } from '$lib/server/worldCache.js';

export async function GET({ url }) {
	const accountId = url.searchParams.get('accountId') || undefined;
	const onlyUnseen = url.searchParams.get('onlyUnseen') === 'true';
	const includeDismissed = url.searchParams.get('includeDismissed') === 'true';
	const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 100, 500));
	const items = list({ accountId, onlyUnseen, includeDismissed, limit });
	// Backfill world names from the world cache so invite/announcement
	// notifications show a readable name instead of the raw wrld_xxx ID.
	const missing = items.filter((n) => n.worldId && !n.worldName).map((n) => n.worldId);
	if (missing.length) {
		const names = bulkLookup(missing);
		for (const n of items) {
			if (n.worldId && !n.worldName) n.worldName = names[n.worldId] || '';
		}
	}
	return json({
		notifications: items,
		unseen: unseenCounts()
	});
}

/** Tell VRChat too (best effort, one request at a time, so a big batch does not hit the rate limit). */
async function syncSeen(byAccount) {
	for (const [accountId, ids] of Object.entries(byAccount)) {
		if (!getSession(accountId)?.user) continue;
		for (const id of ids) {
			const n = getNotification(accountId, id);
			const v2 = n?.raw?.version === 2 || String(id).startsWith('notif_');
			await seeNotification(accountId, id, { v2 }).catch(() => {});
			await new Promise((r) => setTimeout(r, 250));
		}
	}
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const action = body?.action;
	if (action === 'seen') {
		if (body.id) markSeen(body.id);
		bus.emit('notifications');
		return json({ ok: true });
	}
	if (action === 'seenMany') {
		// body.items: [{ accountId, id }] — what the panel showed as unread
		/** @type {Record<string, string[]>} */
		const byAccount = {};
		for (const x of (Array.isArray(body.items) ? body.items : []).slice(0, 500)) {
			if (x?.id && x?.accountId) (byAccount[String(x.accountId)] ||= []).push(String(x.id));
		}
		for (const [accountId, ids] of Object.entries(byAccount)) markSeenIds(accountId, ids);
		bus.emit('notifications');
		void syncSeen(byAccount);
		return json({ ok: true });
	}
	if (action === 'dismiss') {
		if (body.id) dismiss(body.id);
		else dismissAll(body.accountId || null);
		bus.emit('notifications');
		return json({ ok: true });
	}
	return json({ error: 'unknown action' }, { status: 400 });
}
