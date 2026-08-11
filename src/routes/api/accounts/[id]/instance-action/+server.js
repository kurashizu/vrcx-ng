import { json } from '@sveltejs/kit';
import {
	createInstance,
	selfInvite,
	sendRequestInvite
} from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';

/**
 * Unified instance / invite action endpoint.
 *
 * body: {
 *   action: 'createInstance' | 'selfInvite' | 'requestInvite',
 *   ...
 * }
 *
 * - createInstance: { worldId, type?, canRequestInvite?, region?,
 *                    groupId?, groupAccessType?, queueEnabled?,
 *                    displayName? } → POST /instances
 *
 * - selfInvite: { location } → POST /invite/myself/to/{location}
 *   Returns the VRChat response so the UI can show a toast.
 *
 * - requestInvite: { userId, message? } → POST /requestInvite/requestInvite/{userId}
 *   The friend will receive an invite request from us and can accept.
 */
export async function POST({ params, request }) {
	const sess = getSession(params.id);
	if (!sess?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const { action } = body || {};
	if (!action) return json({ ok: false, error: 'action required' }, { status: 400 });

	try {
		switch (action) {
			case 'createInstance': {
				const sess = getSession(params.id);
				// VRChat requires an explicit ownerId for non-public instances
				// (group instances use the group id instead of a user id).
				const ownerId = body.type === 'group' ? body.groupId || undefined : sess?.user?.id;
				if (body.type !== 'public' && !ownerId) {
					return json({ ok: false, error: 'ownerId required for this instance type' }, { status: 400 });
				}
				const r = await createInstance(params.id, {
					worldId: body.worldId,
					type: body.type || 'public',
					canRequestInvite: !!body.canRequestInvite,
					region: body.region || 'us',
					ownerId,
					groupId: body.groupId || undefined,
					groupAccessType: body.groupAccessType || undefined,
					queueEnabled: body.queueEnabled !== false
				});
				return r.ok
					? json({ ok: true, instance: r.data })
					: json({ ok: false, status: r.status, error: r.data?.error?.message || `HTTP ${r.status}` }, { status: 400 });
			}
			case 'selfInvite': {
				const location = body.location;
				if (!location || !location.includes(':')) {
					return json({ ok: false, error: 'location required (wrld_xxx:inst)' }, { status: 400 });
				}
				const r = await selfInvite(params.id, location);
				return r.ok
					? json({ ok: true })
					: json({ ok: false, status: r.status, error: r.data?.error?.message || `HTTP ${r.status}` }, { status: 400 });
			}
			case 'requestInvite': {
				if (!body.userId) {
					return json({ ok: false, error: 'userId required' }, { status: 400 });
				}
				const r = await sendRequestInvite(params.id, body.userId, body.message);
				return r.ok
					? json({ ok: true })
					: json({ ok: false, error: r.error || r.data?.error?.message || 'failed' }, { status: 400 });
			}
			default:
				return json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
		}
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}