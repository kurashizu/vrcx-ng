import { json } from '@sveltejs/kit';
import {
	acceptFriendRequest,
	hideNotification,
	seeNotification,
	respondToInvite
} from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';
import { getNotification, markSeenIds, dismissIds } from '$lib/server/notifications.js';
import { loadFriends } from '$lib/server/friends.js';
import { bus } from '$lib/server/bus.js';

/** Notifications of the V2 generation use other endpoints. */
const isV2 = (n) => n.raw?.version === 2 || String(n.id).startsWith('notif_');

/**
 * Act on a notification — on VRChat's side AND in the local inbox, so what you
 * do here is also reflected in-game / in VRCX.
 *
 * POST /api/accounts/:id/notification
 *   { action: 'accept',  notificationId }                    accept a friend request
 *   { action: 'hide',    notificationId }                    dismiss
 *   { action: 'see',     notificationId }                    mark as read
 *   { action: 'respond', notificationId, responseSlot }      decline an invite / request with a preset message
 */
export async function POST({ params, request }) {
	const accountId = params.id;
	if (!getSession(accountId)?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });
	const body = await request.json().catch(() => ({}));
	const { action, notificationId } = body || {};
	if (!action || !notificationId) return json({ ok: false, error: 'action and notificationId required' }, { status: 400 });

	const n = getNotification(accountId, notificationId);
	if (!n) return json({ ok: false, error: '找不到这条通知' }, { status: 404 });
	const v2 = isV2(n);

	try {
		let r;
		switch (action) {
			case 'accept': {
				if (n.type !== 'friendRequest') return json({ ok: false, error: '只能接受好友请求' }, { status: 400 });
				r = await acceptFriendRequest(accountId, notificationId);
				if (!r.ok) return json(r, { status: 400 });
				markSeenIds(accountId, [notificationId]);
				dismissIds(accountId, [notificationId]);
				// the pipeline announces friend-add too; this just makes the list correct sooner
				loadFriends(accountId);
				break;
			}
			case 'respond': {
				const slot = Number(body.responseSlot);
				if (!Number.isInteger(slot)) return json({ ok: false, error: 'responseSlot required' }, { status: 400 });
				r = await respondToInvite(accountId, notificationId, slot);
				if (!r.ok) return json(r, { status: 400 });
				markSeenIds(accountId, [notificationId]);
				dismissIds(accountId, [notificationId]);
				break;
			}
			case 'hide':
			case 'see': {
				// The local inbox is always updated; VRChat's side is best effort
				// (the notification may already be gone there).
				r = action === 'hide' ? await hideNotification(accountId, notificationId, { v2 }) : await seeNotification(accountId, notificationId, { v2 });
				markSeenIds(accountId, [notificationId]);
				if (action === 'hide') dismissIds(accountId, [notificationId]);
				bus.emit('notifications');
				return json({ ok: true, remote: r.ok, remoteError: r.error });
			}
			default:
				return json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
		}
		bus.emit('notifications');
		return json({ ok: true });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}
