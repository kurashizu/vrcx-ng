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
	try {
		const r = await getPlayerModerations(params.id, type || undefined);
		if (r.ok) {
			// Refresh the local cache so we can show the list even when the
			// VRChat API is down.
			try {
				const db = getDb();
				const upsert = db.prepare(`
					INSERT INTO moderations (id, account_id, target_user_id, target_display_name, type, created_at)
					VALUES (?, ?, ?, ?, ?, ?)
					ON CONFLICT(account_id, target_user_id, type) DO UPDATE SET
						target_display_name = excluded.target_display_name,
						created_at = excluded.created_at
				`);
				const tx = db.transaction((entries) => {
					for (const e of entries) {
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
				tx(r.data);
			} catch {}
			return json({ ok: true, entries: r.data, source: 'live' });
		}
		// API error — fall back to cache
		const db = getDb();
		const where = ['account_id = ?'];
		const args = [params.id];
		if (type) {
			where.push('type = ?');
			args.push(type);
		}
		const cached = db
			.prepare(`SELECT * FROM moderations WHERE ${where.join(' AND ')} ORDER BY created_at DESC`)
			.all(...args)
			.map((r) => ({
				targetUserId: r.target_user_id,
				targetDisplayName: r.target_display_name,
				type: r.type,
				created: new Date(r.created_at).toISOString()
			}));
		return json({ ok: false, entries: cached, source: 'cache', error: 'API error; showing cached list' });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}