import { json } from '@sveltejs/kit';
import {
	addModeration,
	sendRequestInvite,
	sendFriendRequest
} from '$lib/server/vrchat.js';
import { getSession, setSession } from '$lib/server/accounts.js';

/**
 * Generic action endpoint for friend-related actions.
 * body: { action: 'mute'|'unmute'|'block'|'unblock'|'requestInvite'|'friendRequest', userId, message? }
 */
export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const { action, userId, message } = body || {};
	if (!action || !userId) return json({ error: 'action and userId required' }, { status: 400 });

	const sess = getSession(params.id);
	if (!sess?.user) return json({ error: 'Not logged in' }, { status: 401 });

	try {
		switch (action) {
			case 'mute':
			case 'unmute':
			case 'block':
			case 'unblock': {
				const r = await addModeration(params.id, userId, action);
				if (r.status === 200 || r.status === 201) {
					return json({ ok: true });
				}
				return json(
					{ ok: false, error: r.data?.error?.message || r.data?.error || `HTTP ${r.status}` },
					{ status: 400 }
				);
			}
			case 'requestInvite': {
				const r = await sendRequestInvite(params.id, userId, message);
				if (r.ok) return json({ ok: true });
				return json({ ok: false, error: r.error }, { status: 400 });
			}
			case 'friendRequest': {
				const r = await sendFriendRequest(params.id, userId);
				if (r.ok) return json({ ok: true });
				return json(
					{ ok: false, error: r.data?.error?.message || r.data?.error || `HTTP ${r.status}` },
					{ status: 400 }
				);
			}
			default:
				return json({ error: `Unknown action: ${action}` }, { status: 400 });
		}
	} catch (err) {
		setSession(params.id, { lastError: err.message });
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}
