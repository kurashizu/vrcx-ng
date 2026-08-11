import { json } from '@sveltejs/kit';
import { getFriends } from '$lib/server/vrchat.js';

export async function GET({ params, url }) {
	const n = Number(url.searchParams.get('n') || 100);
	const offset = Number(url.searchParams.get('offset') || 0);
	const offline = url.searchParams.get('offline');
	try {
		const friends = await getFriends(params.id, {
			n,
			offset,
			offline: offline == null ? undefined : offline === 'true'
		});
		// Trim down to useful fields
		const summary = friends.map((f) => ({
			id: f.id,
			displayName: f.displayName,
			currentAvatarThumbnailImageUrl: f.currentAvatarThumbnailImageUrl,
			status: f.status,
			state: f.state,
			location: f.location,
			platform: f.platform
		}));
		return json({ friends: summary });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
