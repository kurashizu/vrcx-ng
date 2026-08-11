/**
 * Feed entry types. Modeled after VRCX's shared feed entries.
 * @typedef {Object} FeedEntry
 * @property {string} id              // uuid
 * @property {string} accountId       // which VRChat account this event came from
 * @property {string} accountDisplayName
 * @property {string} type            // 'Online'|'Offline'|'Active'|'GPS'|'Status'|'Bio'|'Avatar'|'Join'|'Leave'|'FriendRequest'|'Invite'|'Instance.Closed'
 * @property {string} created_at      // ISO string
 * @property {string} [userId]
 * @property {string} [displayName]
 * @property {string} [location]      // "wrld_xxx:instance"
 * @property {string} [worldId]
 * @property {string} [worldName]
 * @property {string} [groupName]
 * @property {string} [previousLocation]
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
 * @property {string} [raw]  // raw event for debugging
 */

export const FEED_TYPES = [
	'Online',
	'Offline',
	'Active',
	'GPS',
	'Status',
	'Bio',
	'Avatar',
	'Join',
	'Leave',
	'FriendRequest',
	'Invite',
	'Instance.Closed'
];
