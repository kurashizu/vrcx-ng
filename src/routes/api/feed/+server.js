import { json } from '@sveltejs/kit';
import { queryFeed } from '$lib/server/bus.js';
import { getAllPipelineStates } from '$lib/server/pipeline.js';

/**
 * GET /api/feed?limit=200&before=<ms|ISO>&type=&accountId=&userId=
 * Persisted feed history, newest first. `before` pages backwards.
 */
export async function GET({ url }) {
	const q = url.searchParams;
	const entries = queryFeed({
		limit: q.get('limit') || 200,
		before: q.get('before') || undefined,
		type: q.get('type') || undefined,
		accountId: q.get('accountId') || undefined,
		userId: q.get('userId') || undefined
	});
	const accounts = getAllPipelineStates();
	return json({ entries, accounts });
}
