import { getDb } from './db.js';

/**
 * Settings are stored as a key→JSON-encoded-value map in the `settings` table.
 * Keys use dotted notation: `ui.theme`, `feed.maxEntries`, etc.
 * Read-mostly with bulk-write.
 */

const DEFAULTS = {
	// General
	'ui.theme': 'dark', // 'dark' | 'light' | 'system'
	'ui.hour12': false,
	'ui.showInstanceId': false,
	'ui.trustColors': true,
	'ui.hideSelfInFeed': false,

	// Feed
	'feed.maxEntries': 1000,
	'feed.retentionDays': 0, // 0 = forever
	'feed.types': {
		// enabled by default
		Online: true,
		Offline: true,
		Active: true,
		GPS: true,
		Status: true,
		Bio: false,
		Avatar: true,
		FriendRequest: true,
		Invite: true,
		'Instance.Closed': true,
		Notification: true,
		Group: true
	},

	// Notifications (browser desktop)
	'notification.desktop': false,
	'notification.friendOnline': false,
	'notification.invite': true,
	'notification.friendRequest': true,
	'notification.vipOnline': false,

	// Chatbox
	'chatbox.host': '127.0.0.1',
	'chatbox.port': 9000,
	'chatbox.keepHistory': true,
	'chatbox.historyMax': 20,

	// Friend list
	'friend.showLastSeen': true,
	'friend.sortOfflineBy': 'lastSeen', // 'lastSeen' | 'name'

	// Advanced
	'advanced.lastCleanup': 0
};

let cached = null;

/**
 * Load all settings from DB, fill in defaults for missing keys, cache in memory.
 * @returns {Record<string, any>}
 */
export function loadSettings() {
	if (cached) return cached;
	const rows = getDb().prepare('SELECT key, value FROM settings').all();
	const out = { ...DEFAULTS };
	for (const r of rows) {
		try {
			out[r.key] = JSON.parse(r.value);
		} catch {
			out[r.key] = r.value;
		}
	}
	cached = out;
	return out;
}

export function getSetting(key) {
	const s = loadSettings();
	return s[key];
}

/**
 * Update one or more settings.
 * @param {Record<string, any>} updates
 */
export function setSettings(updates) {
	const db = getDb();
	const stmt = db.prepare(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
	);
	const tx = db.transaction((entries) => {
		for (const [k, v] of entries) {
			stmt.run(k, JSON.stringify(v));
		}
	});
	tx(Object.entries(updates));
	if (cached) {
		cached = { ...cached, ...updates };
	}
}

/**
 * Reset a key (or all keys) back to default.
 * @param {string|null} key
 */
export function resetSettings(key = null) {
	const db = getDb();
	if (key) {
		db.prepare('DELETE FROM settings WHERE key = ?').run(key);
		if (cached) {
			cached[key] = DEFAULTS[key];
		}
	} else {
		db.prepare('DELETE FROM settings').run();
		cached = null;
	}
}

/**
 * Export all settings as JSON (safe for sharing — no secrets).
 */
export function exportSettings() {
	const s = loadSettings();
	const safe = { ...s };
	return safe;
}

/**
 * Get the defaults table for the UI to render initial values.
 */
export function getDefaults() {
	return DEFAULTS;
}

/**
 * Force re-read from DB on next access.
 */
export function invalidateCache() {
	cached = null;
}
