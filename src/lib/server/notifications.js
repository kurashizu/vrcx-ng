import { getDb } from './db.js';

/**
 * Notification store. We persist friend-request, invite, requestInvite, group
 * join/leave, etc. so the user can review history even after a restart.
 *
 * Schema (from db.js):
 *   notifications (id PK, account_id FK, sender_user_id, sender_display_name,
 *                  sender_username, type, category, world_id, world_name,
 *                  instance_id, group_id, message, raw_json, created_at,
 *                  seen_at, dismissed_at)
 */

/**
 * Add a notification. `type` is the raw pipeline type
 * ('friendRequest', 'invite', 'requestInvite', 'group.joined', 'message'…).
 * @param {{
 *   accountId: string,
 *   type: string,
 *   senderUserId?: string,
 *   senderDisplayName?: string,
 *   senderUsername?: string,
 *   worldId?: string,
 *   worldName?: string,
 *   instanceId?: string,
 *   groupId?: string,
 *   message?: string,
 *   raw?: any
 * }} n
 */
export function addNotification(n) {
	if (!n?.accountId || !n?.type) return null;
	const db = getDb();
	// The VRChat notification id doubles as the PK so the REST poller and the
	// websocket handler can both insert safely (INSERT OR IGNORE dedupes).
	const stmt = db.prepare(`INSERT OR IGNORE INTO notifications
		(id, account_id, sender_user_id, sender_display_name, sender_username, type,
		 category, world_id, world_name, instance_id, group_id, message, raw_json, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
	const type = normalizeNotificationType(n.type);
	const ts =
		typeof n.createdAt === 'number'
			? n.createdAt
			: typeof n.created_at === 'number'
				? n.created_at
				: Date.now();
	const info = stmt.run(
		n.id || `${n.accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		n.accountId,
		n.senderUserId || '',
		n.senderDisplayName || '',
		n.senderUsername || '',
		type,
		categoryFor(type),
		n.worldId || '',
		n.worldName || '',
		n.instanceId || '',
		n.groupId || '',
		n.message || '',
		n.raw ? JSON.stringify(n.raw) : '',
		ts
	);
	return info.lastInsertRowid;
}

/**
 * Check whether a notification id is already stored (for the REST poller).
 * @param {string} id
 * @param {string} accountId
 * @returns {boolean}
 */
export function hasNotification(id, accountId) {
	if (!id) return false;
	const row = getDb()
		.prepare('SELECT 1 FROM notifications WHERE id = ? AND account_id = ?')
		.get(id, accountId);
	return !!row;
}

/**
 * Normalize a VRChat notification type to our canonical set:
 *   friendRequest | invite | requestInvite | message | groupAnnouncement | moderation
 * The REST `notifications` endpoint and the websocket use slightly different
 * spellings (e.g. 'group.announcement' vs 'groupAnnouncement').
 * @param {string} t
 * @returns {string}
 */
export function normalizeNotificationType(t) {
	if (!t) return t;
	const s = String(t).toLowerCase().replace(/[^a-z]/g, '');
	if (s === 'groupannouncement' || s === 'groupannouncements') return 'groupAnnouncement';
	if (s === 'friendrequest' || s === 'ignoredfriendrequest') return 'friendRequest';
	if (s === 'invite') return 'invite';
	if (s === 'requestinvite') return 'requestInvite';
	if (s === 'message') return 'message';
	if (s.startsWith('moderation') || s === 'groupinvite' || s === 'groupjoinrequest' || s === 'inviteresponse' || s === 'requestinviteresponse' || s === 'boop') {
		return 'moderation';
	}
	return t;
}

/**
 * Map a pipeline notification type to a coarse-grained category.
 */
function categoryFor(type) {
	const t = String(type || '').toLowerCase();
	if (t.includes('friend')) return 'social';
	if (t.includes('invite')) return 'invite';
	if (t.includes('request')) return 'request';
	if (t.includes('group')) return 'group';
	if (t.includes('message')) return 'message';
	return 'other';
}

/**
 * Mark a notification as seen (read).
 * @param {number} id
 */
export function markSeen(id) {
	getDb()
		.prepare("UPDATE notifications SET seen_at = ? WHERE id = ? AND seen_at IS NULL")
		.run(Date.now(), id);
}

/**
 * Dismiss a notification (soft delete).
 * @param {number} id
 */
export function dismiss(id) {
	getDb()
		.prepare("UPDATE notifications SET dismissed_at = ? WHERE id = ?")
		.run(Date.now(), id);
}

/**
 * Dismiss all visible notifications, optionally scoped to one account.
 * @param {string|null} accountId  pass null to clear across every account
 */
export function dismissAll(accountId = null) {
	if (accountId) {
		getDb()
			.prepare(
				"UPDATE notifications SET dismissed_at = ? WHERE account_id = ? AND dismissed_at IS NULL"
			)
			.run(Date.now(), accountId);
	} else {
		getDb()
			.prepare("UPDATE notifications SET dismissed_at = ? WHERE dismissed_at IS NULL")
			.run(Date.now());
	}
}

/**
 * List recent notifications.
 * @param {{ accountId?: string, onlyUnseen?: boolean, limit?: number }} opts
 */
export function list(opts = {}) {
	const db = getDb();
	const where = [];
	const args = [];
	if (opts.accountId) {
		where.push('account_id = ?');
		args.push(opts.accountId);
	}
	if (opts.onlyUnseen) {
		where.push('seen_at IS NULL');
	}
	if (!opts.includeDismissed) {
		where.push('dismissed_at IS NULL');
	}
	const limit = opts.limit || 100;
	const sql = `SELECT * FROM notifications
		${where.length ? 'WHERE ' + where.join(' AND ') : ''}
		ORDER BY created_at DESC LIMIT ?`;
	args.push(limit);
	const rows = db.prepare(sql).all(...args);
	return rows.map(rowToNotification);
}

function rowToNotification(r) {
	let raw = null;
	if (r.raw_json) {
		try {
			raw = JSON.parse(r.raw_json);
		} catch {}
	}
	return {
		id: r.id,
		accountId: r.account_id,
		type: r.type,
		category: r.category,
		senderUserId: r.sender_user_id,
		senderDisplayName: r.sender_display_name,
		senderUsername: r.sender_username,
		worldId: r.world_id,
		worldName: r.world_name,
		instanceId: r.instance_id,
		groupId: r.group_id,
		message: r.message,
		raw,
		createdAt: r.created_at,
		seenAt: r.seen_at,
		dismissedAt: r.dismissed_at
	};
}

/**
 * Count of unseen notifications per account.
 */
export function unseenCounts() {
	const db = getDb();
	const rows = db
		.prepare(
			`SELECT account_id, COUNT(*) AS n FROM notifications
			 WHERE seen_at IS NULL AND dismissed_at IS NULL GROUP BY account_id`
		)
		.all();
	const out = {};
	for (const r of rows) out[r.account_id] = r.n;
	return out;
}
