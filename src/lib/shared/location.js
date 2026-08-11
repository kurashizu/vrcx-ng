/**
 * Parse a VRChat instance location string into a structured object.
 *
 * VRChat location formats (from VRCX's parseLocation):
 *   - 'offline'                       → isOffline
 *   - 'private'                       → isPrivate
 *   - 'traveling'                     → isTraveling
 *   - 'local:xxxx'                    → local-only (not a real instance)
 *   - 'wrld_xxx:instanceName'         → instance, possibly with ~key(value) qualifiers
 *
 * The qualifiers after `~` describe access type:
 *   ~private(usr_xxx)               → InviteOnly, owner = xxx
 *   ~private(usr_xxx)~canRequestInvite  → InvitePlus
 *   ~friends(usr_xxx)               → FriendsOnly
 *   ~hidden(usr_xxx)                → FriendsOfGuests (Friends+)
 *   ~group(grp_xxx)                 → Group
 *   ~group(grp_xxx)~groupAccessType(public)  → groupPublic
 *   ~group(grp_xxx)~groupAccessType(plus)    → groupPlus
 *   ~region(jp|us|eu)
 *
 * @param {string} tag
 * @returns {{
 *   tag: string,
 *   isOffline: boolean,
 *   isPrivate: boolean,
 *   isTraveling: boolean,
 *   isRealInstance: boolean,
 *   worldId: string,
 *   instanceId: string,
 *   instanceName: string,
 *   shortName: string,
 *   accessType: ''|'public'|'invite'|'invite+'|'friends'|'friends+'|'group'|'groupPublic'|'groupPlus',
 *   accessTypeLabel: string,
 *   region: string,
 *   userId: string|null,
 *   groupId: string|null,
 *   groupName: string,
 *   groupAccessType: string|null,
 *   canRequestInvite: boolean,
 *   strict: boolean,
 *   ageGate: boolean
 * }}
 */
export function parseLocation(tag) {
	let _tag = String(tag || '');
	const ctx = {
		tag: _tag,
		isOffline: false,
		isPrivate: false,
		isTraveling: false,
		isRealInstance: false,
		worldId: '',
		instanceId: '',
		instanceName: '',
		shortName: '',
		accessType: '',
		accessTypeLabel: '',
		region: '',
		userId: null,
		groupId: null,
		groupName: '',
		groupAccessType: null,
		canRequestInvite: false,
		strict: false,
		ageGate: false
	};
	if (_tag === 'offline' || _tag === 'offline:offline') {
		ctx.isOffline = true;
	} else if (_tag === 'private' || _tag === 'private:private') {
		ctx.isPrivate = true;
	} else if (_tag === 'traveling' || _tag === 'traveling:traveling') {
		ctx.isTraveling = true;
	} else if (tag && !_tag.startsWith('local')) {
		ctx.isRealInstance = true;
		const sep = _tag.indexOf(':');
		const shortNameQualifier = '&shortName=';
		const shortNameIndex = _tag.indexOf(shortNameQualifier);
		if (shortNameIndex >= 0) {
			ctx.shortName = _tag.substr(shortNameIndex + shortNameQualifier.length);
			_tag = _tag.substr(0, shortNameIndex);
		}
		if (sep >= 0) {
			ctx.worldId = _tag.substr(0, sep);
			ctx.instanceId = _tag.substr(sep + 1);
			ctx.instanceId.split('~').forEach((s, i) => {
				if (i) {
					const A = s.indexOf('(');
					const Z = A >= 0 ? s.lastIndexOf(')') : -1;
					const key = Z >= 0 ? s.substr(0, A) : s;
					const value = A < Z ? s.substr(A + 1, Z - A - 1) : '';
					if (key === 'private') {
						ctx.accessType = 'invite';
						ctx.userId = value;
					} else if (key === 'hidden') {
						ctx.accessType = 'friends+';
						ctx.userId = value;
					} else if (key === 'friends') {
						ctx.accessType = 'friends';
						ctx.userId = value;
					} else if (key === 'canRequestInvite') {
						ctx.canRequestInvite = true;
						if (ctx.accessType === 'invite') ctx.accessType = 'invite+';
					} else if (key === 'region') {
						ctx.region = value;
					} else if (key === 'group') {
						ctx.groupId = value;
						ctx.accessType = 'group';
					} else if (key === 'groupAccessType') {
						ctx.groupAccessType = value;
					} else if (key === 'strict') {
						ctx.strict = true;
					} else if (key === 'ageGate') {
						ctx.ageGate = true;
					}
				} else {
					ctx.instanceName = s;
				}
			});
			if (!ctx.accessType) ctx.accessType = 'public';
			ctx.accessTypeLabel = ctx.accessType;
			if (ctx.groupId && ctx.groupAccessType) {
				ctx.accessTypeLabel = `group${ctx.groupAccessType[0].toUpperCase()}${ctx.groupAccessType.slice(1)}`;
			}
		} else {
			ctx.worldId = _tag;
		}
	}
	return ctx;
}

/**
 * Display label for an instance access type. Chinese by default.
 * @param {string} type  accessTypeLabel from parseLocation
 * @returns {string}
 */
export function accessTypeLabel(type) {
	switch (type) {
		case 'public':
			return '公开';
		case 'invite':
			return '邀请';
		case 'invite+':
			return '邀请+';
		case 'friends':
			return '好友';
		case 'friends+':
			return '好友+';
		case 'group':
			return '群组';
		case 'groupPublic':
			return '群组公开';
		case 'groupPlus':
			return '群组Plus';
		default:
			return type || '';
	}
}

/**
 * Color class for an access type (matches existing CSS variables).
 * @param {string} type
 * @returns {string} a CSS class name
 */
export function accessTypeColor(type) {
	switch (type) {
		case 'public':
			return 'at-public';
		case 'invite':
			return 'at-invite';
		case 'invite+':
			return 'at-invite-plus';
		case 'friends':
			return 'at-friends';
		case 'friends+':
			return 'at-friends-plus';
		case 'group':
		case 'groupPublic':
		case 'groupPlus':
			return 'at-group';
		default:
			return '';
	}
}

/**
 * Compact display label like "邀请 (us_xxx)" — used inline in friend rows.
 * @param {string} location
 * @param {string} [groupName]
 */
export function locationShort(location, groupName = '') {
	const L = parseLocation(location);
	if (L.isOffline) return '离线';
	if (L.isPrivate) return 'Private';
	if (L.isTraveling) return 'Traveling';
	if (!L.isRealInstance) return '';
	if (groupName && L.accessType.startsWith('group')) {
		return `${accessTypeLabel(L.accessTypeLabel)}(${groupName})`;
	}
	if (L.accessType && L.accessType !== 'public') {
		return accessTypeLabel(L.accessTypeLabel);
	}
	return '';
}

/**
 * Short, human-readable instance label. Avoids showing the raw instance ID
 * (which is usually a long random hash) wherever possible.
 *
 * Returns something like:
 *   - '邀请'                 → invite-only
 *   - '邀请+'                → invite+ (canRequestInvite)
 *   - '好友'                 → friends-only
 *   - '好友+ 赵某'           → friends+ with owner name
 *   - '群组 clubX'           → group instance
 *   - '公开 #abc1234'        → public with short hash
 *   - '~eu'                  → public with region only
 *   - 'shortName'            → custom shortName if present
 *
 * @param {object} L  parsed location
 * @param {string} [ownerName]  optional display name for the instance owner
 */
export function shortInstanceLabel(L, ownerName = '') {
	if (!L) return '';
	if (L.isOffline) return '离线';
	if (L.isPrivate) return 'Private';
	if (L.isTraveling) return 'Traveling';
	if (!L.isRealInstance) return '';
	if (L.shortName) return L.shortName;
	const type = accessTypeLabel(L.accessTypeLabel);
	if (L.accessType === 'invite' || L.accessType === 'invite+') return type;
	if (L.accessType === 'friends') return type;
	if (L.accessType === 'friends+') return ownerName ? `${type} ${ownerName}` : type;
	if (L.accessType.startsWith('group')) {
		const g = L.groupId ? L.groupId.replace(/^grp_/, '') : '';
		return g ? `${type} ${truncate(g, 8)}` : type;
	}
	// public: show region + short nonce if any
	if (L.region) return `~${L.region}`;
	if (L.instanceName) return truncate(L.instanceName, 12);
	return '';
}

function truncate(s, n) {
	if (!s) return '';
	if (s.length <= n) return s;
	return s.slice(0, n - 1) + '…';
}

/**
 * Resolve region from a parsed location.
 */
export function regionOf(L) {
	if (!L || L.isOffline || L.isPrivate || L.isTraveling) return '';
	if (L.region) return L.region;
	if (L.instanceId) return 'us';
	return '';
}
