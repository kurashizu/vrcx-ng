import { json } from '@sveltejs/kit';
import { getInviteMessages, editInviteMessage, MESSAGE_TYPES } from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';

/**
 * Preset invite / request messages (12 slots per kind).
 *   GET /api/accounts/:id/invite-messages?type=message|request|response|requestResponse
 *   PUT body { type, slot, message }   (a freshly edited slot has a ~60 min cooldown)
 */
export async function GET({ params, url }) {
	if (!getSession(params.id)?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });
	const type = url.searchParams.get('type') || 'message';
	if (!MESSAGE_TYPES.includes(type)) return json({ ok: false, error: 'bad type' }, { status: 400 });
	const r = await getInviteMessages(params.id, type);
	return json(r, { status: r.ok ? 200 : 502 });
}

export async function PUT({ params, request }) {
	if (!getSession(params.id)?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });
	const body = await request.json().catch(() => ({}));
	const message = typeof body.message === 'string' ? body.message.trim() : '';
	if (!message || message.length > 64) {
		return json({ ok: false, error: 'Message must not be empty and at most 64 characters' }, { status: 400 });
	}
	const r = await editInviteMessage(params.id, body.type, Number(body.slot), message);
	return json(r, { status: r.ok ? 200 : 400 });
}
