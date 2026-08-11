import { json } from '@sveltejs/kit';
import * as fav from '$lib/server/favorites.js';

export async function GET({ url }) {
	const type = url.searchParams.get('type') || undefined;
	const accountId = url.searchParams.get('accountId') || undefined;
	const targetId = url.searchParams.get('targetId') || undefined;
	const items = fav.list({ type, accountId, targetId });
	return json({ favorites: items });
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	try {
		const id = fav.add(body);
		return json({ ok: true, id });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}

export async function DELETE({ url }) {
	const type = url.searchParams.get('type');
	const targetId = url.searchParams.get('targetId');
	const accountId = url.searchParams.get('accountId') || null;
	if (!type || !targetId) return json({ ok: false, error: 'type and targetId required' }, { status: 400 });
	const removed = fav.remove({ accountId, type, targetId });
	return json({ ok: true, removed });
}
