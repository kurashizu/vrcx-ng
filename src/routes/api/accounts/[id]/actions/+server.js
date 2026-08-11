import { json } from '@sveltejs/kit';
import {
	addModeration,
	sendRequestInvite,
	sendFriendRequest,
	sendInvite
} from '$lib/server/vrchat.js';
import { getSession, setSession } from '$lib/server/accounts.js';
import { getSelfLocations } from '$lib/server/friends.js';

/**
 * Generic action endpoint for friend-related actions.
 * body: { action: 'mute'|'unmute'|'block'|'unblock'|'requestInvite'|'friendRequest'|'invite', userId, message?, location? }
 */
export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const { action, userId, message, location } = body || {};
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
			case 'invite': {
				// No explicit location → invite into the account's current instance.
				let loc = location;
				if (!loc) {
					const self = getSelfLocations();
					for (const s of self.values()) {
						if (s.accountId === params.id) {
							loc = s.location;
							break;
						}
					}
				}
				if (!loc) {
					return json({ ok: false, error: '该账号当前不在任何实例中' }, { status: 400 });
				}
				const r = await sendInvite(params.id, userId, loc, message);
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
			case 'unfriend': {
				const r = await unfriend(params.id, userId);
				if (r.ok) {
					removeFriend(params.id, userId);
					return json({ ok: true });
				}
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
