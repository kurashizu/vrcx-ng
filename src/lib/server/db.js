import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = process.env.DATA_DIR || './data';

function ensureDir() {
	if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'vrcx-ng.db');

let _db = null;

/**
 * Get the singleton DB connection. Initializes schema on first call.
 */
export function getDb() {
	if (_db) return _db;
	ensureDir();
	const db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	migrate(db);
	// one-shot JSON migration if a legacy data dir is present and DB is empty
	migrateFromJsonIfNeeded(db);
	_db = db;
	return db;
}

/* ---------------------------- schema ---------------------------- */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT,
    password_enc TEXT NOT NULL,
    two_factor_enc TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    cookie TEXT,
    user_json TEXT,
    last_error TEXT,
    last_login_at INTEGER,
    pipeline_token TEXT,
    pipeline_token_at INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    current_avatar_thumbnail_url TEXT,
    current_avatar_image_url TEXT,
    current_avatar TEXT,
    status TEXT,
    status_description TEXT,
    bio TEXT,
    state TEXT NOT NULL DEFAULT 'offline',
    location TEXT,
    platform TEXT,
    last_platform TEXT,
    last_seen INTEGER,
    tags TEXT,
    raw_json TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_friends_state ON friends(account_id, state);
CREATE INDEX IF NOT EXISTS idx_friends_updated ON friends(account_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS feed_events (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    account_display_name TEXT,
    type TEXT NOT NULL,
    user_id TEXT,
    display_name TEXT,
    location TEXT,
    previous_location TEXT,
    world_id TEXT,
    world_name TEXT,
    group_name TEXT,
    avatar_name TEXT,
    status TEXT,
    status_description TEXT,
    previous_status TEXT,
    previous_status_description TEXT,
    bio TEXT,
    previous_bio TEXT,
    current_avatar_image_url TEXT,
    current_avatar_thumbnail_image_url TEXT,
    previous_current_avatar_image_url TEXT,
    previous_current_avatar_thumbnail_image_url TEXT,
    detail TEXT,
    raw_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_feed_created ON feed_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_account ON feed_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_type ON feed_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_user ON feed_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    sender_user_id TEXT,
    sender_display_name TEXT,
    sender_username TEXT,
    type TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    world_id TEXT,
    world_name TEXT,
    instance_id TEXT,
    group_id TEXT,
    message TEXT,
    raw_json TEXT,
    created_at INTEGER NOT NULL,
    seen_at INTEGER,
    dismissed_at INTEGER,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_account ON notifications(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unseen ON notifications(account_id, seen_at) WHERE seen_at IS NULL;

CREATE TABLE IF NOT EXISTS favorites (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_name TEXT,
    group_name TEXT,
    note TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(account_id, type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_fav_type ON favorites(type);
CREATE INDEX IF NOT EXISTS idx_fav_target ON favorites(target_id);

CREATE TABLE IF NOT EXISTS moderations (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    target_user_id TEXT NOT NULL,
    target_display_name TEXT,
    type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(account_id, target_user_id, type)
);
CREATE INDEX IF NOT EXISTS idx_mod_account ON moderations(account_id, type);

CREATE TABLE IF NOT EXISTS invite_messages (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL,
    message TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(account_id, slot)
);

CREATE TABLE IF NOT EXISTS world_cache (
    world_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    thumbnail_url TEXT,
    author_id TEXT,
    author_name TEXT,
    occupants INTEGER,
    raw_json TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS avatar_cache (
    avatar_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    thumbnail_url TEXT,
    author_id TEXT,
    author_name TEXT,
    release_status TEXT,
    raw_json TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cache (
    user_id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_cache_expires ON user_cache(expires_at);

CREATE TABLE IF NOT EXISTS instance_queues (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    instance_location TEXT NOT NULL,
    world_id TEXT,
    position INTEGER,
    estimated_wait_seconds INTEGER,
    queued_at INTEGER NOT NULL,
    ready_at INTEGER,
    left_at INTEGER,
    notified INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
`;

function migrate(db) {
	db.exec(SCHEMA);
}

/* ------------------ one-shot JSON → SQLite migration ------------------ */

function migrateFromJsonIfNeeded(db) {
	const markerKey = '_migration_done_v1';
	const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(markerKey);
	if (existing) return;

	const accountsFile = path.join(DATA_DIR, 'accounts.json');
	const sessionsFile = path.join(DATA_DIR, 'sessions.json');

	let did = false;
	const insertAccount = db.prepare(`
		INSERT OR REPLACE INTO accounts (id, username, display_name, password_enc, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`);
	const insertSession = db.prepare(`
		INSERT OR REPLACE INTO sessions (account_id, cookie, user_json, last_error, last_login_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`);

	const tx = db.transaction(() => {
		if (fs.existsSync(accountsFile)) {
			try {
				const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
				const now = Date.now();
				for (const a of accounts) {
					if (!a.id) continue;
					insertAccount.run(
						a.id,
						a.username || '',
						a.displayName || a.username || '',
						a.passwordEnc || '',
						a.createdAt || now,
						a.updatedAt || now
					);
					did = true;
				}
				console.log(`[db] migrated ${accounts.length} accounts from JSON`);
			} catch (err) {
				console.error('[db] accounts.json migration failed', err.message);
			}
		}
		if (fs.existsSync(sessionsFile)) {
			try {
				const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
				const now = Date.now();
				for (const [accountId, sess] of Object.entries(sessions)) {
					if (!accountId) continue;
					insertSession.run(
						accountId,
						sess.cookie || null,
						sess.user ? JSON.stringify(sess.user) : null,
						sess.lastError || null,
						sess.lastLoginAt || null,
						sess.updatedAt || now
					);
					did = true;
				}
				console.log(`[db] migrated ${Object.keys(sessions).length} sessions from JSON`);
			} catch (err) {
				console.error('[db] sessions.json migration failed', err.message);
			}
		}
		db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
			markerKey,
			String(Date.now())
		);
	});
	tx();
	if (did) {
		console.log('[db] JSON → SQLite migration complete (existing JSON files kept as backup)');
	}
}

/**
 * Close DB (used in tests / on shutdown).
 */
export function closeDb() {
	if (_db) {
		_db.close();
		_db = null;
	}
}

/**
 * Run inside a transaction.
 * @template T
 * @param {(db: Database.Database) => T} fn
 * @returns {T}
 */
export function tx(fn) {
	const db = getDb();
	const t = db.transaction(fn);
	return t();
}
