import { json } from '@sveltejs/kit';
import { getBufferedFeed } from '$lib/server/bus.js';
import { getAllPipelineStates } from '$lib/server/pipeline.js';

export async function GET() {
	const entries = getBufferedFeed().slice(0, 200);
	const accounts = getAllPipelineStates();
	return json({ entries, accounts });
}
