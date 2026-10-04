import { json } from '@sveltejs/kit';
import { getVrcFavorites, addVrcFavorite, removeVrcFavorite } from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';

/**
 * VRChat-side favorites (the groups you see in-game / in VRCX).
 *   GET    /api/accounts/:id/vrc-favorites            → { groups, favorites, limits }
 *   POST   body { type: friend|world|avatar|vrcPlusWorld, favoriteId, group }   (moves it if already favorited)
 *   DELETE ?favoriteId=usr_/wrld_/avtr_…
 */
const TTL_MS = 2 * 60 * 1000;
/** @type {Map<string, { t: number, data: any }>} */
const cache = new Map();

async function load(accountId, fresh = false) {
	const hit = cache.get(accountId);
	if (!fresh && hit && Date.now() - hit.t < TTL_MS) return hit.data;
	const data = await getVrcFavorites(accountId);
	if (data.ok) cache.set(accountId, { t: Date.now(), data });
	return data;
}

export async function GET({ params, url }) {
	if (!getSession(params.id)?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });
	const r = await load(params.id, !!url.searchParams.get('fresh'));
	return json(r, { status: r.ok ? 200 : 502 });
}

export async function POST({ params, request }) {
	if (!getSession(params.id)?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });
	const { type, favoriteId, group } = await request.json().catch(() => ({}));
	if (!type || !favoriteId || !group) return json({ ok: false, error: 'type, favoriteId and group required' }, { status: 400 });
	// already favorited somewhere (even in another group): remove first, like VRCX's "move"
	const cur = await load(params.id, true);
	if (cur.ok && cur.favorites.some((f) => f.favoriteId === favoriteId && f.type === type)) {
		const rm = await removeVrcFavorite(params.id, favoriteId);
		if (!rm.ok) return json(rm, { status: 400 });
	}
	const r = await addVrcFavorite(params.id, type, favoriteId, group);
	cache.delete(params.id);
	return json(r, { status: r.ok ? 200 : 400 });
}

export async function DELETE({ params, url }) {
	if (!getSession(params.id)?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });
	const favoriteId = url.searchParams.get('favoriteId');
	if (!favoriteId) return json({ ok: false, error: 'favoriteId required' }, { status: 400 });
	const r = await removeVrcFavorite(params.id, favoriteId);
	cache.delete(params.id);
	return json(r, { status: r.ok ? 200 : 400 });
}
