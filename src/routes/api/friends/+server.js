import { json } from '@sveltejs/kit';
import { aggregate } from '$lib/server/friends.js';

export async function GET() {
	return json(aggregate());
}
