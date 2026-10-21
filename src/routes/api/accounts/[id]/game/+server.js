import { json } from '@sveltejs/kit';
import { launchGame } from '$lib/server/gameLauncher.js';

/** POST /api/accounts/:id/game — start the desktop game client logged in as this account (see gameLauncher). body: { location? } also joins that instance. */
export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	try {
		return json({ ok: true, ...(await launchGame(params.id, body.location ? String(body.location) : undefined)) });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
