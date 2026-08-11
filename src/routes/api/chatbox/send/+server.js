import { json } from '@sveltejs/kit';
import * as chatbox from '$lib/server/chatbox.js';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const result = await chatbox.send({
			text: body.text,
			immediate: body.immediate,
			sfx: body.sfx
		});
		return json(result);
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
