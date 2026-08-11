import { json } from '@sveltejs/kit';
import * as chatbox from '$lib/server/chatbox.js';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const result = await chatbox.setTyping({ typing: body.typing });
		return json(result);
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
