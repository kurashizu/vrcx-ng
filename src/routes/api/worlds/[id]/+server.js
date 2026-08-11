import { json } from '@sveltejs/kit';
import { getWorldMeta } from '$lib/server/worldCache.js';
import { listAccounts, getSession } from '$lib/server/accounts.js';
import { friendsInWorld } from '$lib/server/friends.js';

/**
 * GET /api/worlds/:id
 *
 * Returns world metadata + list of friends currently in this world.
 * Picks the first logged-in account to use as the authenticated caller
 * (VRChat's world API is a public read; we just need any active cookie).
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
	return json({ ...meta, friendsInWorld: friends });
}
