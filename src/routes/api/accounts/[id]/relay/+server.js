import { json } from '@sveltejs/kit';
import { relayJoin } from '$lib/server/gameLauncher.js';

/** POST /api/accounts/:id/relay — body { to: accountId, location }: join as :id, invite `to` from inside, then start the game as `to` in the same instance. */
export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	try {
		return json({ ok: true, ...(await relayJoin(params.id, String(body.to || ''), String(body.location || ''))) });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
