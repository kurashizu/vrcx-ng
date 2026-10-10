import { getDb } from './db.js';

/**
 * User-defined friend groups. Stored locally so we can categorize any userId
 * (friend or not) into a group. These are NOT VRChat "groups" — those are
 * organizations — these are local-only categories, similar to VRCX's
 * `group_0`..`group_3` slots.
 *
 * Default groups (VRCX-compatible keys):
 *   group_0 — Friends
 *   group_1 — Acquaintance
 *   group_2 — Work
 *   group_3 — Other
 */

const DEFAULTS = [
	{ name: 'group_0', displayName: 'Friends', sortOrder: 0, color: '#3ddc97' },
	{ name: 'group_1', displayName: 'Acquaintances', sortOrder: 1, color: '#1fb8ff' },
	{ name: 'group_2', displayName: 'Work', sortOrder: 2, color: '#ffb454' },
	{ name: 'group_3', displayName: 'Other', sortOrder: 3, color: '#b27cff' }
];

/**
 * Seed the default groups exactly once. (Seeding whenever the table is empty
 * would undo a user deleting every group.)
 */
function seedDefaults() {
	const db = getDb();
	const key = '_friend_groups_seeded';
	if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key)) return;
	const now = Date.now();
	const has = db.prepare('SELECT COUNT(*) AS n FROM friend_groups').get().n;
	const tx = db.transaction(() => {
		if (has === 0) {
			const stmt = db.prepare(
				'INSERT OR IGNORE INTO friend_groups (name, display_name, sort_order, color, visible, created_at) VALUES (?, ?, ?, ?, 1, ?)'
			);
			for (const g of DEFAULTS) {
				stmt.run(g.name, g.displayName, g.sortOrder, g.color, now);
			}
		}
		db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(now));
	});
	tx();
}

export function listGroups() {
	seedDefaults();
	return getDb()
		.prepare('SELECT * FROM friend_groups ORDER BY sort_order, name')
		.all()
		.map(rowToGroup);
}

export function getGroup(name) {
	return rowToGroup(getDb().prepare('SELECT * FROM friend_groups WHERE name = ?').get(name));
}

export function createGroup({ name, displayName, color = '#7c5cff' }) {
	if (!name || !displayName) throw new Error('name and displayName required');
	if (getGroup(name)) throw new Error('Group already exists');
	const db = getDb();
	const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM friend_groups').get().m;
	db.prepare(
		'INSERT INTO friend_groups (name, display_name, sort_order, color, visible, created_at) VALUES (?, ?, ?, ?, 1, ?)'
	).run(name, displayName, maxOrder + 1, color, Date.now());
	return getGroup(name);
}

export function updateGroup(name, { displayName, color, visible, sortOrder }) {
	const db = getDb();
	const cur = getGroup(name);
	if (!cur) throw new Error('group not found');
	db.prepare(
		`UPDATE friend_groups SET
			display_name = COALESCE(?, display_name),
			color = COALESCE(?, color),
			visible = COALESCE(?, visible),
			sort_order = COALESCE(?, sort_order)
		 WHERE name = ?`
	).run(displayName ?? null, color ?? null, visible == null ? null : visible ? 1 : 0, sortOrder ?? null, name);
	return getGroup(name);
}

export function deleteGroup(name) {
	getDb().prepare('DELETE FROM friend_groups WHERE name = ?').run(name);
}

export function listMembers(groupName) {
	return getDb()
		.prepare('SELECT * FROM friend_group_members WHERE group_name = ? ORDER BY sort_order, added_at')
		.all(groupName)
		.map(rowToMember);
}

/**
 * Map userId → groupName for the given set of user IDs (or all, if omitted).
 * Each userId appears at most once. If a user is in multiple groups, the
 * group with the lowest sort_order wins.
 */
export function getGroupsForUsers(userIds) {
	const db = getDb();
	let rows;
	if (Array.isArray(userIds) && userIds.length) {
		const placeholders = userIds.map(() => '?').join(',');
		rows = db
			.prepare(
				`SELECT m.user_id, m.group_name, g.sort_order
				 FROM friend_group_members m
				 JOIN friend_groups g ON g.name = m.group_name
				 WHERE m.user_id IN (${placeholders})
				 ORDER BY g.sort_order, m.added_at`
			)
			.all(...userIds);
	} else {
		rows = db
			.prepare(
				`SELECT m.user_id, m.group_name, g.sort_order
				 FROM friend_group_members m
				 JOIN friend_groups g ON g.name = m.group_name
				 ORDER BY g.sort_order, m.added_at`
			)
			.all();
	}
	// keep only the first (lowest sort_order) group per user
	const out = new Map();
	for (const r of rows) {
		if (!out.has(r.user_id)) out.set(r.user_id, r.group_name);
	}
	return out;
}

/**
 * Put a user into a group. A user belongs to one group at a time (the UI shows
 * a single group per friend), so any other membership is dropped — otherwise
 * "moving" a friend to a later group would keep showing the old one.
 */
export function addMember({ groupName, userId, note = '' }) {
	if (!groupName || !userId) throw new Error('groupName and userId required');
	const db = getDb();
	const tx = db.transaction(() => {
		db.prepare('DELETE FROM friend_group_members WHERE user_id = ? AND group_name != ?').run(userId, groupName);
		const maxOrder = db
			.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM friend_group_members WHERE group_name = ?')
			.get(groupName).m;
		db.prepare(
			`INSERT OR REPLACE INTO friend_group_members (group_name, user_id, note, sort_order, added_at)
			 VALUES (?, ?, ?, ?, ?)`
		).run(groupName, userId, note, maxOrder + 1, Date.now());
	});
	tx();
}

export function removeMember({ groupName, userId }) {
	getDb()
		.prepare('DELETE FROM friend_group_members WHERE group_name = ? AND user_id = ?')
		.run(groupName, userId);
}

function rowToGroup(r) {
	if (!r) return null;
	return {
		name: r.name,
		displayName: r.display_name,
		sortOrder: r.sort_order,
		color: r.color,
		visible: !!r.visible,
		createdAt: r.created_at
	};
}
function rowToMember(r) {
	return {
		groupName: r.group_name,
		userId: r.user_id,
		note: r.note,
		sortOrder: r.sort_order,
		addedAt: r.added_at
	};
}
