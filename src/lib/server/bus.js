import { EventEmitter } from 'node:events';
import { getDb } from './db.js';
import { getSetting } from './settings.js';

/**
 * Server-side event bus. SSE endpoints subscribe to `feed` events and forward
 * them to all connected clients.
 */
class Bus extends EventEmitter {
	constructor() {
		super();
		this.setMaxListeners(0);
	}
}

export const bus = new Bus();

/* ------------------------------ feed store ------------------------------ */

/**
 * Feed entries are persisted to `feed_events` and mirrored in a newest-first
 * in-memory buffer (what late SSE joiners get as their initial snapshot).
 * The buffer is seeded from the DB lazily on first use so a restart keeps the
 * history.
 *
 * Entry field → column. Everything else on an entry (userThumbnailUrl,
 * platform, time, raw, …) is stored as JSON in `raw_json`.
 */
const COLS = {
	id: 'id',
	accountId: 'account_id',
	accountDisplayName: 'account_display_name',
	type: 'type',
	userId: 'user_id',
	displayName: 'display_name',
	location: 'location',
	previousLocation: 'previous_location',
	worldId: 'world_id',
	worldName: 'world_name',
	groupName: 'group_name',
	avatarName: 'avatar_name',
	status: 'status',
	statusDescription: 'status_description',
	previousStatus: 'previous_status',
	previousStatusDescription: 'previous_status_description',
	bio: 'bio',
	previousBio: 'previous_bio',
	currentAvatarImageUrl: 'current_avatar_image_url',
	currentAvatarThumbnailImageUrl: 'current_avatar_thumbnail_image_url',
	previousCurrentAvatarImageUrl: 'previous_current_avatar_image_url',
	previousCurrentAvatarThumbnailImageUrl: 'previous_current_avatar_thumbnail_image_url',
	detail: 'detail'
};
const COL_KEYS = Object.keys(COLS);
const COL_NAMES = Object.values(COLS);

/** @type {import('../shared/feed.js').FeedEntry[]} newest first */
const feedBuffer = [];
const MAX_BUFFER = 2000;
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let ready = false;
let insertStmt = null;
let warnedPersist = false;

function ensureReady() {
	if (ready) return;
	ready = true;
	try {
		const db = getDb();
		db.exec('CREATE INDEX IF NOT EXISTS idx_feed_created_id ON feed_events(created_at DESC, id)');
		const rows = db
			.prepare('SELECT * FROM feed_events ORDER BY created_at DESC, rowid DESC LIMIT ?')
			.all(MAX_BUFFER);
		for (const r of rows) feedBuffer.push(rowToEntry(r));
		pruneFeed();
		setInterval(pruneFeed, PRUNE_INTERVAL_MS).unref?.();
	} catch (err) {
		console.error('[bus] feed history unavailable, running from memory only:', err.message);
	}
}

function rowToEntry(r) {
	const e = {};
	for (const [key, col] of Object.entries(COLS)) if (r[col] != null) e[key] = r[col];
	if (r.raw_json) {
		try {
			Object.assign(e, JSON.parse(r.raw_json));
		} catch {}
	}
	e.created_at = new Date(r.created_at).toISOString();
	return e;
}

function persist(entry) {
	const db = getDb();
	insertStmt ??= db.prepare(
		`INSERT OR IGNORE INTO feed_events (${COL_NAMES.join(', ')}, raw_json, created_at)
		 VALUES (${[...COL_NAMES, 'raw_json', 'created_at'].map(() => '?').join(', ')})`
	);
	const extras = {};
	for (const [k, v] of Object.entries(entry)) {
		if (!(k in COLS) && k !== 'created_at' && v !== undefined) extras[k] = v;
	}
	insertStmt.run(
		...COL_KEYS.map((k) => (entry[k] == null ? null : typeof entry[k] === 'string' ? entry[k] : String(entry[k]))),
		Object.keys(extras).length ? JSON.stringify(extras) : null,
		Date.parse(entry.created_at) || Date.now()
	);
}

/**
 * The same friend event is reported by every one of the user's accounts that
 * is friends with them. Entries of these types are collapsed when an
 * identical one from another account arrived moments ago. (Invites, friend
 * requests, … are per-account and never collapsed.)
 */
const DEDUPE_TYPES = new Set(['Online', 'Offline', 'Active', 'GPS', 'Status', 'Bio', 'Avatar']);
const DEDUPE_WINDOW_MS = 8000;
/** @type {Map<string, { t: number, accountId: string }>} */
const recent = new Map();

function isDuplicate(entry) {
	if (!entry.userId || !DEDUPE_TYPES.has(entry.type)) return false;
	const now = Date.now();
	for (const [k, v] of recent) if (now - v.t > DEDUPE_WINDOW_MS) recent.delete(k);
	const key = [
		entry.type,
		entry.userId,
		entry.location,
		entry.status,
		entry.statusDescription,
		entry.bio,
		entry.currentAvatarImageUrl
	].join('|');
	const prev = recent.get(key);
	if (prev && prev.accountId !== entry.accountId) return true;
	if (!prev) recent.set(key, { t: now, accountId: entry.accountId });
	return false;
}

/**
 * Persist a feed entry, push it to all SSE subscribers and buffer it for late
 * joiners. Returns false when it was dropped as a cross-account duplicate.
 * @param {import('../shared/feed.js').FeedEntry} entry
 */
export function publishFeed(entry) {
	ensureReady();
	if (!entry?.id) entry.id = crypto.randomUUID();
	if (!entry.created_at) entry.created_at = new Date().toISOString();
	if (isDuplicate(entry)) return false;
	feedBuffer.unshift(entry);
	if (feedBuffer.length > MAX_BUFFER) feedBuffer.length = MAX_BUFFER;
	try {
		persist(entry);
	} catch (err) {
		// A DB hiccup must never stop live delivery.
		if (!warnedPersist) {
			warnedPersist = true;
			console.error('[bus] failed to persist feed entry:', err.message);
		}
	}
	bus.emit('feed', entry);
	return true;
}

/** Newest-first snapshot of the in-memory buffer. */
export function getBufferedFeed() {
	ensureReady();
	return feedBuffer.slice();
}

/**
 * Query persisted feed history, newest first.
 * @param {{ limit?: number, before?: number|string, type?: string, accountId?: string, userId?: string }} [q]
 */
export function queryFeed({ limit = 200, before, type, accountId, userId } = {}) {
	ensureReady();
	const n = Math.max(1, Math.min(Number(limit) || 200, 1000));
	const where = [];
	const args = [];
	if (before) {
		const t = Number(before) || Date.parse(before);
		if (t) {
			where.push('created_at < ?');
			args.push(t);
		}
	}
	if (type) {
		where.push('type = ?');
		args.push(type);
	}
	if (accountId) {
		where.push('account_id = ?');
		args.push(accountId);
	}
	if (userId) {
		where.push('user_id = ?');
		args.push(userId);
	}
	try {
		return getDb()
			.prepare(
				`SELECT * FROM feed_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
				 ORDER BY created_at DESC, rowid DESC LIMIT ?`
			)
			.all(...args, n)
			.map(rowToEntry);
	} catch {
		return feedBuffer.filter((e) => (!type || e.type === type) && (!accountId || e.accountId === accountId)).slice(0, n);
	}
}

/**
 * Delete feed rows older than the `feed.retentionDays` setting (0 = keep).
 */
export function pruneFeed() {
	const days = Number(getSetting('feed.retentionDays')) || 0;
	if (days <= 0) return;
	try {
		const info = getDb()
			.prepare('DELETE FROM feed_events WHERE created_at < ?')
			.run(Date.now() - days * 24 * 60 * 60 * 1000);
		if (info.changes) console.log(`[bus] pruned ${info.changes} feed entries older than ${days}d`);
	} catch (err) {
		console.error('[bus] feed prune failed:', err.message);
	}
}

/**
 * Replace bare usr_xxx display names in already-stored feed entries once
 * the real name is learned (via friend sync or a later event).
 * @param {string} userId
 * @param {string} displayName
 */
export function backfillFeedNames(userId, displayName) {
	if (!userId || !displayName || userId === displayName) return;
	if (ready) {
		for (const e of feedBuffer) {
			if (e.userId === userId && (!e.displayName || e.displayName === userId)) {
				e.displayName = displayName;
			}
		}
	}
	try {
		getDb()
			.prepare(
				`UPDATE feed_events SET display_name = ?
				 WHERE user_id = ? AND (display_name IS NULL OR display_name = '' OR display_name = user_id)`
			)
			.run(displayName, userId);
	} catch {}
}
