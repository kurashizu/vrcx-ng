import { json } from '@sveltejs/kit';
import {
	addModeration,
	sendRequestInvite,
	sendFriendRequest,
	sendInvite,
	unfriend,
	cancelFriendRequest
} from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';
import { getSelfLocations, removeFriend } from '$lib/server/friends.js';
import { getWorldMeta } from '$lib/server/worldCache.js';
import { invalidateUserDetail } from '$lib/server/userDetailCache.js';

const errText = (r) => r.data?.error?.message || r.data?.error || `HTTP ${r.status}`;

/**
 * Generic action endpoint for friend-related actions.
 * body: { action: 'mute'|'unmute'|'block'|'unblock'|'requestInvite'|'friendRequest'|'cancelFriendRequest'|'unfriend'|'invite',
 *          userId, location?, requestSlot? (requestInvite), messageSlot? (invite) }
 * requestSlot / messageSlot pick one of the 12 preset messages (see invite-messages).
 */
export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const { action, userId, location } = body || {};
	const slot = (v) => (Number.isInteger(v) && v >= 0 && v < 12 ? v : undefined);
	if (!action || !userId) return json({ error: 'action and userId required' }, { status: 400 });

	const sess = getSession(params.id);
	if (!sess?.user) return json({ error: 'Not logged in' }, { status: 401 });

	try {
		// whatever the action, the cached detail view of this user is now stale
		if (['friendRequest', 'cancelFriendRequest', 'unfriend', 'mute', 'unmute', 'block', 'unblock'].includes(action)) {
			invalidateUserDetail(params.id, userId);
		}
		switch (action) {
			case 'mute':
			case 'unmute':
			case 'block':
			case 'unblock': {
				const r = await addModeration(params.id, userId, action);
				if (r.status === 200 || r.status === 201) {
					return json({ ok: true });
				}
				return json({ ok: false, error: errText(r) }, { status: 400 });
			}
			case 'requestInvite': {
				const r = await sendRequestInvite(params.id, userId, { requestSlot: slot(body.requestSlot) });
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
				// VRChat shows the world name in the invite notification (VRCX sends it).
				const worldId = String(loc).split(':')[0];
				const meta = worldId.startsWith('wrld_')
					? await getWorldMeta(params.id, worldId).catch(() => null)
					: null;
				const r = await sendInvite(params.id, userId, loc, {
					worldName: meta?.name,
					messageSlot: slot(body.messageSlot)
				});
				if (r.ok) return json({ ok: true });
				return json({ ok: false, error: r.error }, { status: 400 });
			}
			case 'friendRequest': {
				const r = await sendFriendRequest(params.id, userId);
				if (r.ok) return json({ ok: true });
				return json({ ok: false, error: errText(r) }, { status: 400 });
			}
			case 'cancelFriendRequest': {
				const r = await cancelFriendRequest(params.id, userId);
				if (r.ok) return json({ ok: true });
				return json({ ok: false, error: r.error }, { status: 400 });
			}
			case 'unfriend': {
				const r = await unfriend(params.id, userId);
				if (r.ok) {
					removeFriend(params.id, userId);
					return json({ ok: true });
				}
				return json({ ok: false, error: errText(r) }, { status: 400 });
			}
			default:
				return json({ error: `Unknown action: ${action}` }, { status: 400 });
		}
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}
