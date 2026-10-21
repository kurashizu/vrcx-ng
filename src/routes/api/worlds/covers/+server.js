import { json } from '@sveltejs/kit';
import { getWorldMeta } from '$lib/server/worldCache.js';
import { listSessions } from '$lib/server/accounts.js';

/** worlds being fetched in the background, so a second request does not start them again */
const fetching = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fill(accountId, ids) {
	for (const id of ids) {
		try {
			await getWorldMeta(accountId, id);
		} catch {}
		fetching.delete(id);
		await sleep(120); // one request at a time, gently
	}
}

/**
 * GET /api/worlds/covers?ids=wrld_a,wrld_b&accountId=…
 * → { covers: { <worldId>: { image, thumb } }, pending }
 * Cached worlds come back at once; the missing ones are fetched in the background (`pending` > 0: ask again).
 */
export function GET({ url }) {
	const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter((s) => /^wrld_[A-Za-z0-9-]+$/.test(s)))].slice(0, 120);
	const sessions = listSessions();
	let accountId = url.searchParams.get('accountId') || '';
	if (!sessions[accountId]?.user) accountId = Object.keys(sessions).find((k) => sessions[k]?.user) || '';

	const covers = {};
	const missing = [];
	return (async () => {
		for (const id of ids) {
			const m = await getWorldMeta(accountId, id, { fetchOnMiss: false });
			if (m?.imageUrl || m?.thumbnailUrl) covers[id] = { image: m.imageUrl || m.thumbnailUrl, thumb: m.thumbnailUrl || m.imageUrl };
			else missing.push(id);
		}
		const todo = missing.filter((id) => !fetching.has(id));
		if (accountId && todo.length) {
			todo.forEach((id) => fetching.add(id));
			void fill(accountId, todo);
		}
		return json({ covers, pending: missing.length });
	})();
}
