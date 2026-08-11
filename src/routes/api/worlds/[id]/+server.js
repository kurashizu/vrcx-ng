import { json } from '@sveltejs/kit';
import { getWorldMeta } from '$lib/server/worldCache.js';
import { listAccounts, getSession } from '$lib/server/accounts.js';
import { friendsInWorld, getSelfLocations } from '$lib/server/friends.js';
import { api } from '$lib/server/vrchat.js';

/**
 * GET /api/worlds/:id
 *
 * Returns world metadata + friends currently in this world plus the
 * aggregated instance list (active public instances, the requesting
 * account's own instance, and friends' instances in this world) so the
 * detail dialog can self-invite into any of them.
 *
 * Query params:
 *   - accountId=<id>  optional: use a specific account for the cache lookup
 */
export async function GET({ params, url }) {
	const worldId = params.id;
	if (!worldId || !worldId.startsWith('wrld_')) {
		return json({ error: 'invalid worldId' }, { status: 400 });
	}

	// Pick the requesting account, else the first logged-in one
	let accountId = url.searchParams.get('accountId');
	if (!accountId) {
		for (const a of listAccounts()) {
			if (getSession(a.id)?.cookie) {
				accountId = a.id;
				break;
			}
		}
	}
	if (!accountId) {
		return json({ error: 'no logged-in account to fetch world' }, { status: 503 });
	}

	const meta = await getWorldMeta(accountId, worldId, { fetchOnMiss: true });
	if (!meta) {
		return json({ error: 'world not found' }, { status: 404 });
	}
	const friends = friendsInWorld(worldId);
	const instances = await collectInstances(accountId, worldId);
	return json({ ...meta, friendsInWorld: friends, instances });
}

/**
 * Aggregate every instance we know about in this world:
 *   1. active public instances from VRChat's instances API
 *   2. the calling account's own current instance
 *   3. friends' current instances
 * Each entry carries `instanceId` so the dialog can build `wrld:inst`
 * and self-invite (works for every access type).
 */
async function collectInstances(accountId, worldId) {
	const out = new Map(); // instanceId -> entry

	const add = (instParsed, extra = {}) => {
		const id = String(instParsed.instanceId || '');
		if (!id) return;
		const key = id;
		const prev = out.get(key) || {
			instanceId: id,
			ownerUserId: instParsed.userId || '',
			ownerName: '',
			occupants: 0,
			capacity: null,
			accessType: instParsed.accessType || 'public',
			canRequestInvite: !!instParsed.canRequestInvite,
			users: []
		};
		prev.occupants += extra.occupants || 0;
		if (extra.ownerName) prev.ownerName = prev.ownerName || extra.ownerName;
		if (extra.ownerUserId) prev.ownerUserId = prev.ownerUserId || extra.ownerUserId;
		if (extra.userName && !prev.users.includes(extra.userName)) prev.users.push(extra.userName);
		out.set(key, prev);
	};

	const parse = (loc) => {
		const [w, inst] = String(loc || '').split(':');
		if (w !== worldId || !inst) return null;
		return { instanceId: inst, userId: null, accessType: 'public', canRequestInvite: false };
	};

	// 1) active public instances
	try {
		const r = await api(accountId, `worlds/${worldId}/instances`, { method: 'GET' });
		if (Array.isArray(r.data)) {
			for (const i of r.data) {
				if (!i?.id) continue;
				const tag = `${worldId}:${i.id}`;
				let parsed = null;
				try {
					const { parseLocationFull } = await import('$lib/server/friends.js');
					parsed = parseLocationFull(tag);
				} catch {
					parsed = { instanceId: i.id, userId: i.ownerId || null, accessType: i.type || 'public', canRequestInvite: !!i.canRequestInvite };
				}
				add(parsed, { occupants: typeof i.occupants === 'number' ? i.occupants : 0 });
			}
		}
	} catch {}

	// 2) every logged-in account's own current instance (so a private /
	//    friends instance you are in is always visible & self-invitable)
	for (const s of getSelfLocations().values()) {
		const p = parse(s.location);
		if (!p) continue;
		add(p, { ownerName: s.displayName, ownerUserId: s.userId || '', occupants: 1 });
	}

	// 3) friends currently in this world
	for (const f of friendsInWorld(worldId)) {
		const p = parse(f.location);
		if (!p) continue;
		if (f.instanceId) p.instanceId = f.instanceId;
		p.accessType = f.instanceType || f.accessType || p.accessType;
		p.userId = f.ownerUserId || f.userId || p.userId;
		add(p, {
			ownerName: f.displayName,
			ownerUserId: f.ownerUserId || f.userId || '',
			userName: f.displayName,
			occupants: 1
		});
	}

	return Array.from(out.values())
		.map((e) => ({ ...e }))
		.sort((a, b) => String(a.instanceId).localeCompare(String(b.instanceId)));
}
