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
	Online: { icon: 'dot', color: 'var(--online)', label: 'Online', verb: 'came online' },
	Offline: { icon: 'dot', color: 'var(--offline)', label: 'Offline', verb: 'went offline' },
	Active: { icon: 'dot', color: 'var(--active)', label: 'Active', verb: 'is now Active' },
	GPS: { icon: 'pin', color: 'var(--warn)', label: 'Moved', verb: 'moved to' },
	Status: { icon: 'message', color: 'var(--accent-2)', label: 'Status', verb: 'changed status' },
	Bio: { icon: 'pencil', color: 'var(--accent)', label: 'Bio', verb: 'updated bio' },
	Avatar: { icon: 'user', color: '#ff8ec6', label: 'Avatar', verb: 'switched avatar' },
	Join: { icon: 'log-in', color: 'var(--join)', label: 'Join', verb: 'joined' },
	Leave: { icon: 'log-out', color: 'var(--leave)', label: 'Leave', verb: 'left' },
	FriendRequest: { icon: 'user-plus', color: 'var(--request)', label: 'Friend request', verb: 'sent a friend request' },
	Invite: { icon: 'mail', color: 'var(--request)', label: 'Invite', verb: 'sent an invite' },
	'Instance.Closed': { icon: 'door', color: 'var(--danger)', label: 'Instance closed', verb: 'instance was closed' },
	Friend: { icon: 'users', color: 'var(--request)', label: 'Friend', verb: 'became friends' },
	DisplayName: { icon: 'id-card', color: 'var(--accent-2)', label: 'Rename', verb: 'changed name' },
	TrustLevel: { icon: 'award', color: 'var(--warn)', label: 'Trust rank', verb: 'trust rank changed' },
	Group: { icon: 'tag', color: 'var(--accent)', label: 'Group', verb: 'group' },
	Notification: { icon: 'bell', color: 'var(--text-dim)', label: 'Notification', verb: 'notification' }
};

export const FEED_TYPES = Object.keys(FEED_META);

/** Metadata for a type, with a neutral fallback for unknown ones. */
export function feedMeta(type) {
	return FEED_META[type] || { icon: '•', color: 'var(--text-dim)', label: type, verb: type };
}

/** The verb phrase of an entry ("came online", "moved to", …). */
export function entryVerb(entry) {
	if (entry.type === 'Friend') return entry.raw?.subtype === 'friend-delete' ? 'unfriended' : 'became friends';
	if (entry.type === 'Invite') return 'sent an invite';
	if (entry.type === 'FriendRequest') return 'sent a friend request';
	return feedMeta(entry.type).verb;
}
