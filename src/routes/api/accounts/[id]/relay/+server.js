import { json } from '@sveltejs/kit';
import { relayJoin } from '$lib/server/gameLauncher.js';

/**
 * POST /api/accounts/:id/relay — body { to: accountId | accountId[], location, mode: 'join' | 'invite' }
 * Join as :id, invite the `to` accounts from inside, close the game; 'join' then starts the game as the (single) target in the instance.
 */
export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	try {
		return json({ ok: true, ...(await relayJoin(params.id, body.to, String(body.location || ''), body.mode === 'invite' ? 'invite' : 'join')) });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
