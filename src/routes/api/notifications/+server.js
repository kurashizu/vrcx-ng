import { json } from '@sveltejs/kit';
import { list, markSeen, dismiss, dismissAll, unseenCounts } from '$lib/server/notifications.js';
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

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const action = body?.action;
	if (action === 'seen') {
		if (body.id) markSeen(body.id);
		bus.emit('notifications');
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
