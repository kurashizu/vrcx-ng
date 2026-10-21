import { json } from '@sveltejs/kit';
import { launchGame } from '$lib/server/gameLauncher.js';

/** POST /api/accounts/:id/game — start the desktop game client logged in as this account (see gameLauncher). */
export async function POST({ params }) {
	try {
		return json({ ok: true, ...(await launchGame(params.id)) });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
