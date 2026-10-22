import { json } from '@sveltejs/kit';
import { getUser } from '$lib/server/vrchat.js';
import { lookupDisplayName } from '$lib/server/friends.js';
import { listSessions } from '$lib/server/accounts.js';

/** user id → { at, name }: display names of people who are nobody's friend (instance creators), kept for a day */
const cache = new Map();
const fetching = new Set();
const TTL = 24 * 3600_000;
const TTL_MISS = 3600_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fill(accountId, ids) {
	for (const id of ids) {
		let name = '';
		try {
			name = (await getUser(accountId, id))?.displayName || '';
		} catch {}
		cache.set(id, { at: Date.now(), name });
		fetching.delete(id);
		await sleep(150);
	}
}

/**
 * GET /api/user-names?ids=usr_a,usr_b&accountId=…
 * → { names: { <userId>: displayName }, pending }
 * Names any account already knows (friends) come back at once, the rest are fetched in the background.
 */
export function GET({ url }) {
	const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter((s) => /^usr_[0-9a-fA-F-]+$/.test(s)))].slice(0, 60);
	const sessions = listSessions();
	let accountId = url.searchParams.get('accountId') || '';
	if (!sessions[accountId]?.user) accountId = Object.keys(sessions).find((k) => sessions[k]?.user) || '';
	const names = {};
	const todo = [];
	let pending = 0;
	for (const id of ids) {
		const known = lookupDisplayName(id);
		const c = cache.get(id);
		if (known) names[id] = known;
		else if (c && Date.now() - c.at < (c.name ? TTL : TTL_MISS)) names[id] = c.name;
		else {
			pending++;
			if (!fetching.has(id)) todo.push(id);
		}
	}
	if (accountId && todo.length) {
		todo.forEach((id) => fetching.add(id));
		void fill(accountId, todo);
	} else if (!accountId) pending = 0;
	return json({ names, pending });
}
