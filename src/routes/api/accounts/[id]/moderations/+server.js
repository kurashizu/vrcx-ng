import { json } from '@sveltejs/kit';
import { getPlayerModerations } from '$lib/server/vrchat.js';
import { getSession } from '$lib/server/accounts.js';
import { getDb } from '$lib/server/db.js';

/**
 * GET /api/accounts/:id/moderations?type=mute|block
 *   Lists active moderation entries. Also caches them to the local
 *   `moderations` table so the UI doesn't have to re-fetch on every
 *   page load.
 */
export async function GET({ params, url }) {
	const sess = getSession(params.id);
	if (!sess?.user) return json({ ok: false, error: 'Not logged in' }, { status: 401 });
	const type = url.searchParams.get('type') || '';
	// VRChat's playermoderations endpoint returns *all* history for a
	// type, including rows that were later undone (an `unmute` does not
	// remove the original `mute` row). To show only currently-active
	// mods we fetch the active type + its undo type and drop any target
	// whose newest record is the undo type.
	const TYPE_PAIRS = { mute: 'unmute', block: 'unblock' };
	const undoType = TYPE_PAIRS[type] || '';

	const activeOnly = (entries) => {
		if (!type) return entries;
		const lists = entries.filter((e) => e.type === type || e.type === undoType);
		const latest = new Map();
		for (const e of lists) {
			const cur = latest.get(e.targetUserId);
			const t = Date.parse(e.created || '') || 0;
			if (!cur || t > cur) latest.set(e.targetUserId, t);
		}
		const undone = new Map();
		for (const e of lists) {
			if (e.type === undoType) undone.set(e.targetUserId, e.created);
		}
		return lists.filter(
			(e) => e.type === type && !undone.has(e.targetUserId)
		);
	};

	try {
		const [r1, r2] = await Promise.all([
			getPlayerModerations(params.id, type || undefined),
			undoType ? getPlayerModerations(params.id, undoType) : Promise.resolve({ ok: true, data: [] })
		]);
		if (r1.ok && r2.ok) {
			const entries = activeOnly([...(r1.data || []), ...(r2.data || [])]);
			// Refresh the local cache so we can show the list even when the
			// VRChat API is down. Prune undone pairs from the cache too.
			try {
				const db = getDb();
				const upsert = db.prepare(`
					INSERT INTO moderations (id, account_id, target_user_id, target_display_name, type, created_at)
					VALUES (?, ?, ?, ?, ?, ?)
					ON CONFLICT(account_id, target_user_id, type) DO UPDATE SET
						target_display_name = excluded.target_display_name,
						created_at = excluded.created_at
				`);
				const tx = db.transaction((rows) => {
					for (const e of rows) {
						upsert.run(
							crypto.randomUUID(),
							params.id,
							e.targetUserId || '',
							e.targetDisplayName || '',
							e.type || '',
							Date.parse(e.created || '') || Date.now()
						);
					}
				});
				tx(entries);
			} catch {}
			return json({ ok: true, entries, source: 'live' });
		}
		// API error — fall back to cache
		const db = getDb();
		const cached = db
			.prepare('SELECT * FROM moderations WHERE account_id = ? ORDER BY created_at DESC')
			.all(params.id)
			.map((r) => ({
				targetUserId: r.target_user_id,
				targetDisplayName: r.target_display_name,
				type: r.type,
				created: new Date(r.created_at).toISOString()
			}));
		return json({
			ok: false,
			entries: activeOnly(cached),
			source: 'cache',
			error: 'API error; showing cached list'
		});
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}