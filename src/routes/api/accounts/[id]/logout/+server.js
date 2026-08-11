import { json } from '@sveltejs/kit';
import { clearSession } from '$lib/server/accounts.js';
import { disconnectPipeline } from '$lib/server/pipeline.js';
import { dropFriends } from '$lib/server/friends.js';

export async function POST({ params }) {
	await disconnectPipeline(params.id);
	dropFriends(params.id);
	clearSession(params.id);
	return json({ ok: true });
}
