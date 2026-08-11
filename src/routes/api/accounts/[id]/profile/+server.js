import { json } from '@sveltejs/kit';
import { updateOwnProfile } from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';

/**
 * Update the account's own public profile.
 *   POST /api/accounts/:id/profile
 *   body: { bio?, bioLinks?, status?, statusDescription?, pronouns? }
 */
export async function POST({ params, request }) {
	const sess = getSession(params.id);
	if (!sess?.user) return json({ error: 'Not logged in' }, { status: 401 });
	const body = await request.json().catch(() => ({}));

	const clean = {};
	for (const key of ['bio', 'status', 'statusDescription', 'pronouns']) {
		if (key in body) clean[key] = typeof body[key] === 'string' ? body[key] : '';
	}
	if (Array.isArray(body.bioLinks)) {
		clean.bioLinks = body.bioLinks.map((l) => String(l || '').trim()).filter(Boolean).slice(0, 3);
	}
	if (!Object.keys(clean).length) {
		return json({ error: 'nothing to update' }, { status: 400 });
	}

	const r = await updateOwnProfile(params.id, clean);
	if (r.ok) {
		return json({ ok: true, user: r.data });
	}
	return json(
		{ ok: false, error: r.data?.error?.message || r.data?.error || `HTTP ${r.status}` },
		{ status: 400 }
	);
}
