/**
 * Feed entry types. Modeled after VRCX's shared feed entries.
 * @typedef {Object} FeedEntry
 * @property {string} id              // uuid
 * @property {string} accountId       // which VRChat account this event came from
 * @property {string} accountDisplayName
 * @property {string} type            // 'Online'|'Offline'|'Active'|'GPS'|'Status'|'Bio'|'Avatar'|'Join'|'Leave'|'FriendRequest'|'Invite'|'Instance.Closed'|'Friend'|'Group'|'Notification'
 * @property {string} created_at      // ISO string
 * @property {string} [userId]
 * @property {string} [displayName]
 * @property {string} [location]      // "wrld_xxx:instance"
 * @property {string} [worldId]
 * @property {string} [worldName]
 * @property {string} [groupName]
 * @property {string} [previousLocation]
 * @property {string} [previousWorldName]
 * @property {string} [previousDisplayName]   // DisplayName entries
 * @property {string} [trustLevel]            // TrustLevel entries (e.g. 'Known User')
 * @property {string} [previousTrustLevel]
 * @property {string} [avatarName]
 * @property {string} [currentAvatarImageUrl]
 * @property {string} [currentAvatarThumbnailImageUrl]
 * @property {string} [previousCurrentAvatarImageUrl]
 * @property {string} [previousCurrentAvatarThumbnailImageUrl]
 * @property {string} [status]                 // 'join me'|'active'|'busy'|'ask me'|'offline'
 * @property {string} [statusDescription]
 * @property {string} [previousStatus]
 * @property {string} [previousStatusDescription]
 * @property {string} [bio]
 * @property {string} [previousBio]
 * @property {number} [time]          // ms: time online (Offline) / time at the previous place (GPS)
 * @property {string} [platform]
 * @property {string} [detail]
 * @property {string} [raw]  // raw event for debugging
 */

/**
 * One registry for everything the UI knows about a feed type: its icon, accent
 * colour, Chinese label (filters, settings) and the verb used in the feed line.
 * Object order is the display order of the type chips.
 */
export const FEED_META = {
	Online: { icon: '🟢', color: 'var(--online)', label: '上线', verb: '上线了' },
	Offline: { icon: '⚫', color: 'var(--offline)', label: '离线', verb: '离线了' },
	Active: { icon: '🔵', color: 'var(--active)', label: 'Active', verb: '变成了 Active' },
	GPS: { icon: '📍', color: 'var(--warn)', label: '移动', verb: '移动到了' },
	Status: { icon: '💬', color: 'var(--accent-2)', label: '状态', verb: '更改了状态' },
	Bio: { icon: '✏️', color: 'var(--accent)', label: 'Bio', verb: '更新了 Bio' },
	Avatar: { icon: '👤', color: '#ff8ec6', label: '模型', verb: '切换了模型' },
	Join: { icon: '➡️', color: 'var(--join)', label: '加入', verb: '加入了' },
	Leave: { icon: '⬅️', color: 'var(--leave)', label: '离开', verb: '离开了' },
	FriendRequest: { icon: '🤝', color: 'var(--request)', label: '好友请求', verb: '发来好友请求' },
	Invite: { icon: '✉️', color: 'var(--request)', label: '邀请', verb: '发来邀请' },
	'Instance.Closed': { icon: '🚪', color: 'var(--danger)', label: '实例关闭', verb: '实例已关闭' },
	Friend: { icon: '🧑‍🤝‍🧑', color: 'var(--request)', label: '好友', verb: '成为了好友' },
	DisplayName: { icon: '🪪', color: 'var(--accent-2)', label: '改名', verb: '改名了' },
	TrustLevel: { icon: '🎖️', color: 'var(--warn)', label: '信任等级', verb: '信任等级变化' },
	Group: { icon: '🏷️', color: 'var(--accent)', label: '群组', verb: '群组' },
	Notification: { icon: '🔔', color: 'var(--text-dim)', label: '通知', verb: '通知' }
};

export const FEED_TYPES = Object.keys(FEED_META);

/** Metadata for a type, with a neutral fallback for unknown ones. */
export function feedMeta(type) {
	return FEED_META[type] || { icon: '•', color: 'var(--text-dim)', label: type, verb: type };
}

/** The verb phrase of an entry ("上线了", "移动到了", …). */
export function entryVerb(entry) {
	if (entry.type === 'Friend') return entry.raw?.subtype === 'friend-delete' ? '解除了好友关系' : '成为了好友';
	if (entry.type === 'Invite') return '发送了邀请';
	if (entry.type === 'FriendRequest') return '发送了好友请求';
	return feedMeta(entry.type).verb;
}
