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
	// Undoing a moderation now removes it server-side (PUT unplayermoderate),
	// but accounts that used the old "unmute" record still have rows whose
	// newest entry for a target is the undo type. Fetch the active type + its
	// undo type and keep a target only when its newest record is the active
	// type (one entry per target).
	const TYPE_PAIRS = { mute: 'unmute', block: 'unblock' };
	const undoType = TYPE_PAIRS[type] || '';

	const activeOnly = (entries) => {
		if (!type) return entries;
		const lists = entries
			.filter((e) => e.type === type || e.type === undoType)
			.sort((a, b) => (Date.parse(b.created || '') || 0) - (Date.parse(a.created || '') || 0));
		const newest = new Map();
		for (const e of lists) {
			if (!newest.has(e.targetUserId)) newest.set(e.targetUserId, e.type);
		}
		const seen = new Set();
		return lists.filter((e) => {
			if (e.type !== type || newest.get(e.targetUserId) !== type || seen.has(e.targetUserId)) return false;
			seen.add(e.targetUserId);
			return true;
		});
	};

	try {
		const [r1, r2] = await Promise.all([
			getPlayerModerations(params.id, type || undefined),
			undoType ? getPlayerModerations(params.id, undoType) : Promise.resolve({ ok: true, data: [] })
		]);
		if (r1.ok && r2.ok) {
			const entries = activeOnly([...(r1.data || []), ...(r2.data || [])]);
			// Refresh the local cache so we can show the list even when the
			// VRChat API is down. The cache mirrors the live list exactly, so
			// entries that are gone upstream are dropped from it.
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
					if (type) db.prepare('DELETE FROM moderations WHERE account_id = ? AND type = ?').run(params.id, type);
					else db.prepare('DELETE FROM moderations WHERE account_id = ?').run(params.id);
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
