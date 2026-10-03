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
 * Add a notification (idempotent on `id`). Returns true when a new row was
 * stored. `type` is the raw pipeline type
 * ('friendRequest', 'invite', 'requestInvite', 'group.joined', 'message'…).
 * @param {{
 *   accountId: string,
 *   type: string,
 *   id?: string,
 *   createdAt?: number|string,
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
	const ts = toMillis(n.createdAt ?? n.created_at);
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
	// true only when a new row was stored (false: this id was already known)
	return info.changes === 1;
}

/** createdAt may arrive as epoch ms or an ISO string. */
function toMillis(v) {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string') {
		const t = Date.parse(v);
		if (!Number.isNaN(t)) return t;
	}
	return Date.now();
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
	if (s === 'inviteresponse') return 'inviteResponse';
	if (s === 'requestinviteresponse') return 'requestInviteResponse';
	if (s === 'groupinvite') return 'groupInvite';
	if (s === 'groupjoinrequest') return 'groupJoinRequest';
	if (s === 'boop') return 'boop';
	if (s.startsWith('moderation')) return 'moderation';
	return t;
}

/**
 * Map a pipeline notification type to a coarse-grained category.
 */
function categoryFor(type) {
	const t = String(type || '').toLowerCase();
	if (t.startsWith('group')) return 'group';
	if (t.includes('friend') || t === 'boop') return 'social';
	if (t.startsWith('requestinvite')) return 'request';
	if (t.includes('invite')) return 'invite';
	if (t.includes('request')) return 'request';
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
 * Mark several notifications (by VRChat id) of one account as seen.
 * @param {string} accountId
 * @param {string[]} ids
 */
export function markSeenIds(accountId, ids) {
	const stmt = getDb().prepare(
		'UPDATE notifications SET seen_at = ? WHERE id = ? AND account_id = ? AND seen_at IS NULL'
	);
	const now = Date.now();
	for (const id of ids || []) stmt.run(now, id, accountId);
}

/**
 * Soft-delete several notifications (by VRChat id) of one account.
 * @param {string} accountId
 * @param {string[]} ids
 */
export function dismissIds(accountId, ids) {
	const stmt = getDb().prepare(
		'UPDATE notifications SET dismissed_at = ? WHERE id = ? AND account_id = ? AND dismissed_at IS NULL'
	);
	const now = Date.now();
	for (const id of ids || []) stmt.run(now, id, accountId);
}

/**
 * Apply a notification-v2-update (`{ id, updates }`): merge the updates into
 * the stored payload and honour `seen`.
 * @param {string} accountId
 * @param {string} id
 * @param {Record<string, any>} updates
 * @returns {boolean} whether the notification is known
 */
export function updateNotification(accountId, id, updates) {
	const db = getDb();
	const row = db
		.prepare('SELECT raw_json FROM notifications WHERE id = ? AND account_id = ?')
		.get(id, accountId);
	if (!row) return false;
	let raw = {};
	try {
		raw = row.raw_json ? JSON.parse(row.raw_json) : {};
	} catch {}
	const next = { ...raw, ...(updates || {}) };
	db.prepare('UPDATE notifications SET raw_json = ? WHERE id = ? AND account_id = ?').run(
		JSON.stringify(next),
		id,
		accountId
	);
	if (updates?.seen === true) markSeenIds(accountId, [id]);
	return true;
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
	const limit = Math.max(1, Math.min(Number(opts.limit) || 100, 1000));
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
