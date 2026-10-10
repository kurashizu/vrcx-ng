import { json } from '@sveltejs/kit';
import { getWorldMeta } from '$lib/server/worldCache.js';
import { listAccounts, getSession } from '$lib/server/accounts.js';
import { friendsInWorld, getSelfLocations } from '$lib/server/friends.js';
import { api, getWorld } from '$lib/server/vrchat.js';
import { parseLocation } from '$lib/shared/location.js';

/** Full world payloads (stats, description, …) are cached briefly: one dialog open = one fetch. */
const FULL_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, { t: number, data: any }>} */
const fullCache = new Map();

async function fullWorld(accountId, worldId) {
	const hit = fullCache.get(worldId);
	if (hit && Date.now() - hit.t < FULL_TTL_MS) return hit.data;
	const w = await getWorld(accountId, worldId).catch(() => null);
	if (w) {
		fullCache.set(worldId, { t: Date.now(), data: w });
		if (fullCache.size > 100) fullCache.delete(fullCache.keys().next().value);
	}
	return w;
}

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

	// The dialog needs the full world object (id, stats, description, …); the
	// cached meta is only the fallback when VRChat can't be reached.
	const [meta, full] = await Promise.all([
		getWorldMeta(accountId, worldId, { fetchOnMiss: true }),
		fullWorld(accountId, worldId)
	]);
	if (!meta && !full) {
		return json({ error: 'world not found' }, { status: 404 });
	}
	const friends = friendsInWorld(worldId);
	const instances = await collectInstances(accountId, worldId);
	await featureInstance(accountId, worldId, url.searchParams.get('location') || '', instances);
	return json({ ...meta, ...full, id: worldId, worldId, friendsInWorld: friends, instances });
}

/**
 * The instance the caller asked about (an invite, a friend's location): mark it
 * `featured`, adding it when none of the sources above knew it — an invite to a
 * group / private instance is not listed anywhere else.
 */
async function featureInstance(accountId, worldId, location, instances) {
	const [w, instanceId] = location.split(':');
	if (w !== worldId || !instanceId) return;
	let entry = instances.find((i) => i.instanceId === instanceId);
	if (!entry) {
		const parsed = parseLocation(location);
		entry = {
			instanceId,
			ownerUserId: parsed.userId || '',
			ownerName: '',
			occupants: 0,
			capacity: null,
			accessType: parsed.accessType || 'public',
			canRequestInvite: !!parsed.canRequestInvite,
			users: []
		};
		instances.unshift(entry);
	}
	try {
		// VRChat's own numbers for exactly this instance
		const r = await api(accountId, `instances/${encodeURIComponent(location)}`, { method: 'GET' });
		const d = r?.data;
		if (d && typeof d === 'object') {
			if (typeof d.n_users === 'number') entry.occupants = d.n_users;
			if (typeof d.capacity === 'number') entry.capacity = d.capacity;
			entry.ownerUserId ||= d.ownerId || '';
		}
	} catch {}
	entry.featured = true;
	instances.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
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
			users: [],
			fromApi: false
		};
		// VRChat's own occupant count is authoritative; friends / own accounts
		// are only counted for instances the API didn't list (they are already
		// part of the API number otherwise).
		if (extra.fromApi) {
			prev.fromApi = true;
			prev.occupants += extra.occupants || 0;
		} else if (!prev.fromApi) {
			prev.occupants += extra.occupants || 0;
		}
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
				const parsed = parseLocation(`${worldId}:${i.id}`);
				add(parsed, { fromApi: true, occupants: typeof i.occupants === 'number' ? i.occupants : 0 });
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
		.map(({ fromApi, ...e }) => e)
		.sort((a, b) => String(a.instanceId).localeCompare(String(b.instanceId)));
}
