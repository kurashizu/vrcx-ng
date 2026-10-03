import { getDb } from './db.js';

/**
 * Favorites: world / avatar / friend favorites.
 * Maps to the `favorites` table in db.js.
 *
 * Schema:
 *   favorites (id PK, account_id FK NULL, type, target_id, target_name,
 *              group_name, note, created_at, UNIQUE(account_id, type, target_id))
 *
 * `account_id` is nullable because a favorite can be shared (i.e. favorite
 * the world once for all accounts). For simplicity here we always associate
 * with the requesting account.
 */

export function list({ type = null, accountId = null, targetId = null, limit = 1000 } = {}) {
	const db = getDb();
	const where = [];
	const args = [];
	if (type) {
		where.push('type = ?');
		args.push(type);
	}
	if (accountId) {
		where.push('account_id = ?');
		args.push(accountId);
	}
	if (targetId) {
		where.push('target_id = ?');
		args.push(targetId);
	}
	const max = Math.max(1, Math.min(Number(limit) || 1000, 5000));
	const sql = `SELECT * FROM favorites ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
	return db.prepare(sql).all(...args, max).map(rowToFav);
}

export function add({ accountId, type, targetId, targetName = '', groupName = '', note = '' }) {
	if (!type || !targetId) throw new Error('type and targetId required');
	const db = getDb();
	const existing = db
		.prepare('SELECT id FROM favorites WHERE (account_id IS ? OR account_id = ?) AND type = ? AND target_id = ?')
		.get(accountId, accountId, type, targetId);
	if (existing) return existing.id;
	const id = crypto.randomUUID();
	db.prepare(`INSERT INTO favorites (id, account_id, type, target_id, target_name, group_name, note, created_at)
	            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
		.run(id, accountId || null, type, targetId, targetName, groupName, note, Date.now());
	return id;
}

/**
 * Remove a favorite. Without an `accountId` every account's entry for that
 * target is removed (a favorite saved with an account would otherwise be
 * impossible to un-favorite from a caller that doesn't know the account).
 */
export function remove({ accountId = null, type, targetId }) {
	const db = getDb();
	const result = accountId
		? db
				.prepare('DELETE FROM favorites WHERE account_id = ? AND type = ? AND target_id = ?')
				.run(accountId, type, targetId)
		: db.prepare('DELETE FROM favorites WHERE type = ? AND target_id = ?').run(type, targetId);
	return result.changes > 0;
}

function rowToFav(r) {
	return {
		id: r.id,
		accountId: r.account_id,
		type: r.type,
		targetId: r.target_id,
		targetName: r.target_name,
		groupName: r.group_name,
		note: r.note,
		createdAt: r.created_at
	};
}
