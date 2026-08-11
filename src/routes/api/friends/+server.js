import { json } from '@sveltejs/kit';
import { aggregate } from '$lib/server/friends.js';
import { listGroups } from '$lib/server/friendGroups.js';

export async function GET() {
	const agg = aggregate();
	return json({
		...agg,
		friendGroups: listGroups()
	});
}
