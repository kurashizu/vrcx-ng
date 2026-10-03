import { json } from '@sveltejs/kit';
import { connectPipeline, disconnectPipeline } from '$lib/server/pipeline.js';
import { loadFriends } from '$lib/server/friends.js';

/** Force a fresh pipeline connection (and friend resync), even if the socket still looks open. */
export async function POST({ params }) {
	try {
		await disconnectPipeline(params.id);
		await connectPipeline(params.id);
		loadFriends(params.id);
		return json({ ok: true });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}
