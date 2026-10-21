import { json } from '@sveltejs/kit';
import { getWorldMeta } from '$lib/server/worldCache.js';
import { listSessions } from '$lib/server/accounts.js';
import { api } from '$lib/server/vrchat.js';
import { parseLocation } from '$lib/shared/location.js';

/**
 * GET /api/instance?location=wrld_x:123~…&accountId=…
 * → { world, instance }  world: cached world meta (name, pictures), instance: VRChat's live numbers
 * for that one instance (null when VRChat does not know it / this account may not see it).
 */
export async function GET({ url }) {
	const location = url.searchParams.get('location') || '';
	const p = parseLocation(location);
	if (!p.isRealInstance || !p.worldId.startsWith('wrld_') || !p.instanceId) return json({ ok: false, error: 'invalid instance location' }, { status: 400 });

	const sessions = listSessions();
	let accountId = url.searchParams.get('accountId') || '';
	if (!sessions[accountId]?.user) accountId = Object.keys(sessions).find((k) => sessions[k]?.user) || '';
	if (!accountId) return json({ ok: false, error: 'no logged-in account' }, { status: 503 });

	const [world, r] = await Promise.all([
		getWorldMeta(accountId, p.worldId).catch(() => null),
		api(accountId, `instances/${p.worldId}:${encodeURIComponent(p.instanceId)}`, { method: 'GET' }).catch(() => null)
	]);
	const d = r?.status === 200 && r.data && typeof r.data === 'object' ? r.data : null;
	const instance = d
		? {
				users: typeof d.n_users === 'number' ? d.n_users : (d.userCount ?? null),
				capacity: d.capacity ?? null,
				ownerId: d.ownerId || '',
				region: d.region || '',
				queueEnabled: !!d.queueEnabled,
				queueSize: d.queueSize ?? 0,
				full: !!d.full,
				closedAt: d.closedAt || null,
				platforms: d.platforms || null,
				shortName: d.shortName || ''
			}
		: null;
	return json({ ok: true, world, instance, status: r?.status ?? 0 });
}
