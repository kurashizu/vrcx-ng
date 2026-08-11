import { json } from '@sveltejs/kit';
import { connectPipeline } from '$lib/server/pipeline.js';

export async function POST({ params }) {
	try {
		await connectPipeline(params.id);
		return json({ ok: true });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}
