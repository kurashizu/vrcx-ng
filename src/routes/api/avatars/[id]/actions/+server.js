import { json } from '@sveltejs/kit';
import { selectAvatar } from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';
import * as fav from '$lib/server/favorites.js';

/**
 * Avatar actions.
 * body: { action: 'select'|'favorite'|'unfavorite', accountId?, groupName? }
 */
export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const { action, accountId, groupName } = body || {};
	const { id } = params;
	if (!action) return json({ error: 'action required' }, { status: 400 });

	// The account whose cookie performs the call.
	let caller = accountId;
	if (!caller) {
		const sess = getSession('*');
		caller = sess?.user?.id || null;
	}
	if (!caller) {
		// fall back to any logged-in session
		const { listSessions } = await import('$lib/server/accounts.js');
		const sessions = listSessions();
		const logged = Object.entries(sessions).find(([, s]) => s?.cookie);
		caller = logged?.[0] || null;
	}
	if (!caller) return json({ error: '没有已登录的账号' }, { status: 400 });

	try {
		if (action === 'select') {
			const r = await selectAvatar(caller, id);
			if (!r.ok) return json({ ok: false, error: r.error }, { status: 400 });
			return json({ ok: true });
		}
		if (action === 'favorite') {
			const meta = body.meta || {};
			const rowId = fav.add({
				type: 'avatar',
				targetId: id,
				targetName: meta.name || '',
				groupName: groupName || 'group_0',
				accountId: meta.accountId || null
			});
			return json({ ok: true, id: rowId });
		}
		if (action === 'unfavorite') {
			fav.remove({ accountId: null, type: 'avatar', targetId: id });
			return json({ ok: true });
		}
		return json({ error: `Unknown action: ${action}` }, { status: 400 });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}
