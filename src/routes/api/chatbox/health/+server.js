import { json } from '@sveltejs/kit';
import * as chatbox from '$lib/server/chatbox.js';

export async function GET() {
	const result = await chatbox.health();
	return json(result);
}
