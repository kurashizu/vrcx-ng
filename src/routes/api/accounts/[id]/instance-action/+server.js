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
 *                    groupId?, groupAccessType?, roleIds?, queueEnabled?,
 *                    displayName?, ageGate? } → POST /instances
 *
 * - selfInvite: { location, shortName? } → POST /invite/myself/to/{location}
 *   Returns the VRChat response so the UI can show a toast.
 *
 * - requestInvite: { userId } → POST /requestInvite/{userId}
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
				const type = body.type || 'public';
				// VRChat requires an explicit ownerId for non-public instances
				// (group instances use the group id instead of a user id).
				const ownerId = type === 'group' ? body.groupId || undefined : sess?.user?.id;
				if (type !== 'public' && !ownerId) {
					return json({ ok: false, error: 'ownerId required for this instance type' }, { status: 400 });
				}
				// Same payload shape VRCX sends: group-only fields are only set for
				// group instances.
				const payload = {
					worldId: body.worldId,
					type,
					canRequestInvite: !!body.canRequestInvite,
					region: body.region || 'us',
					ownerId
				};
				if (type === 'group') {
					payload.groupAccessType = body.groupAccessType || undefined;
					payload.queueEnabled = body.queueEnabled !== false;
					if (body.groupAccessType === 'members' && Array.isArray(body.roleIds)) {
						payload.roleIds = body.roleIds;
					}
					if (body.minimumAvatarPerformance) {
						payload.minimumAvatarPerformance = body.minimumAvatarPerformance;
					}
					if (body.ageGate) payload.ageGate = true;
				}
				if (body.displayName) payload.displayName = String(body.displayName);
				const r = await createInstance(params.id, payload);
				return r.ok
					? json({ ok: true, instance: r.data })
					: json({ ok: false, status: r.status, error: r.data?.error?.message || `HTTP ${r.status}` }, { status: 400 });
			}
			case 'selfInvite': {
				const location = String(body.location || '');
				if (!location) {
					return json({ ok: false, error: 'location required' }, { status: 400 });
				}
				const r = await selfInvite(params.id, location, body.shortName ? String(body.shortName) : undefined);
				if (r.ok) return json({ ok: true });
				// Surface VRChat's exact message (e.g. "'<inst>' is not a valid instanceId")
				return json({ ok: false, status: r.status, error: r.data?.error?.message || `HTTP ${r.status}` }, { status: 400 });
			}
			case 'requestInvite': {
				if (!body.userId) {
					return json({ ok: false, error: 'userId required' }, { status: 400 });
				}
				const r = await sendRequestInvite(params.id, body.userId);
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
