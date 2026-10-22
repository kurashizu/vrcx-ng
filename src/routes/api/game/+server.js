import { json } from '@sveltejs/kit';
import { gameStatus, gameProfiles, forgetGameProfile, deployGameScript, closeAux, closeMain, gameClientsInfo } from '$lib/server/gameLauncher.js';

/** GET /api/game — the learned profile → account map. */
export function GET() {
	try {
		return json({ ok: true, ...gameProfiles() });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}

/**
 * POST /api/game — body: { action: 'test' } → connection check of the game machine;
 *                         { action: 'deploy' } → write the bundled bridge script to the game machine;
 *                         { action: 'forget', profile: 0..N | 'all', client?: 'aux' } → drop learned profile(s) of the main (default) or helper client;
 *                         { action: 'clients' } → the running clients (main / helper) with the learned maps;
 *                         { action: 'close-main' | 'close-aux' } → close that client (never the other one).
 */
export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	try {
		if (body.action === 'test') return json({ ok: true, ...(await gameStatus()) });
		if (body.action === 'deploy') return json({ ok: true, ...(await deployGameScript()) });
		if (body.action === 'clients') return json({ ok: true, ...(await gameClientsInfo()) });
		if (body.action === 'close-main') return json({ ok: true, ...(await closeMain()) });
		if (body.action === 'close-aux') return json({ ok: true, ...(await closeAux()) });
		if (body.action === 'forget') {
			const p = body.profile;
			if (p !== 'all' && !(Number.isInteger(p) && p >= 0 && p < 100)) return json({ ok: false, error: 'profile required' }, { status: 400 });
			return json({ ok: true, profiles: forgetGameProfile(p, body.client === 'aux' ? 'aux' : 'main') });
		}
		return json({ ok: false, error: `Unknown action: ${body.action}` }, { status: 400 });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
