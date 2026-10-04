import { json } from '@sveltejs/kit';
import { saveUserNote } from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';
import { invalidateUserDetail } from '$lib/server/userDetailCache.js';

/** POST /api/accounts/:id/note  body { userId, note } — VRChat's own per-user note. */
export async function POST({ params, request }) {
	if (!getSession(params.id)?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });
	const body = await request.json().catch(() => ({}));
	if (!body.userId || typeof body.note !== 'string') {
		return json({ ok: false, error: 'userId and note required' }, { status: 400 });
	}
	if (body.note.length > 256) return json({ ok: false, error: '备注最多 256 个字符' }, { status: 400 });
	const r = await saveUserNote(params.id, body.userId, body.note);
	if (r.ok) invalidateUserDetail(params.id, body.userId);
	return json(r, { status: r.ok ? 200 : 400 });
}
