import { json } from '@sveltejs/kit';
import { gameStatus, gameProfiles, forgetGameProfile, deployGameScript } from '$lib/server/gameLauncher.js';

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
 *                         { action: 'forget', profile: 0..N | 'all' } → drop learned profile(s).
 */
export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	try {
		if (body.action === 'test') return json({ ok: true, ...(await gameStatus()) });
		if (body.action === 'deploy') return json({ ok: true, ...(await deployGameScript()) });
		if (body.action === 'forget') {
			const p = body.profile;
			if (p !== 'all' && !(Number.isInteger(p) && p >= 0 && p < 100)) return json({ ok: false, error: 'profile required' }, { status: 400 });
			return json({ ok: true, profiles: forgetGameProfile(p) });
		}
		return json({ ok: false, error: `Unknown action: ${body.action}` }, { status: 400 });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
