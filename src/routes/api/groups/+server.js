import { json } from '@sveltejs/kit';
import { getGroup } from '$lib/server/vrchat.js';
import { listSessions } from '$lib/server/accounts.js';

/** group id → { at, card }: names change rarely, so they are kept for a day (an unreadable group for an hour) */
const cache = new Map();
const fetching = new Set();
const TTL = 24 * 3600_000;
const TTL_MISS = 3600_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fill(accountId, ids) {
	for (const id of ids) {
		let card = null;
		try {
			card = await getGroup(accountId, id);
		} catch {}
		cache.set(id, { at: Date.now(), card, miss: !card });
		fetching.delete(id);
		await sleep(150); // one request at a time, gently
	}
}

/**
 * GET /api/groups?ids=grp_a,grp_b&accountId=…
 * → { groups: { <groupId>: { name, shortCode, discriminator, iconUrl, memberCount } }, pending }
 * Cached groups come back at once, the others are fetched in the background (`pending` > 0: ask again).
 * An unreadable group comes back with an empty name, so the client stops asking.
 */
export function GET({ url }) {
	const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter((s) => /^grp_[0-9a-fA-F-]+$/.test(s)))].slice(0, 60);
	const sessions = listSessions();
	let accountId = url.searchParams.get('accountId') || '';
	if (!sessions[accountId]?.user) accountId = Object.keys(sessions).find((k) => sessions[k]?.user) || '';
	const groups = {};
	const todo = [];
	let pending = 0;
	for (const id of ids) {
		const c = cache.get(id);
		const fresh = c && Date.now() - c.at < (c.miss ? TTL_MISS : TTL);
		if (fresh) groups[id] = c.card || { name: '' };
		else {
			pending++;
			if (!fetching.has(id)) todo.push(id);
		}
	}
	if (accountId && todo.length) {
		todo.forEach((id) => fetching.add(id));
		void fill(accountId, todo);
	} else if (!accountId) pending = 0;
	return json({ groups, pending });
}
