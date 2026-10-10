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
			let privateId = null;
			let friendsId = null;
			let hiddenId = null;
			ctx.instanceId.split('~').forEach((s, i) => {
				if (i) {
					const A = s.indexOf('(');
					const Z = A >= 0 ? s.lastIndexOf(')') : -1;
					const key = Z >= 0 ? s.substr(0, A) : s;
					const value = A < Z ? s.substr(A + 1, Z - A - 1) : '';
					if (key === 'private') {
						privateId = value;
					} else if (key === 'hidden') {
						hiddenId = value;
					} else if (key === 'friends') {
						friendsId = value;
					} else if (key === 'canRequestInvite') {
						ctx.canRequestInvite = true;
					} else if (key === 'region') {
						ctx.region = value;
					} else if (key === 'group') {
						ctx.groupId = value;
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
			// Same precedence as VRCX regardless of qualifier order:
			// private > friends > hidden > group.
			ctx.accessType = 'public';
			if (privateId !== null) {
				ctx.accessType = ctx.canRequestInvite ? 'invite+' : 'invite';
				ctx.userId = privateId;
			} else if (friendsId !== null) {
				ctx.accessType = 'friends';
				ctx.userId = friendsId;
			} else if (hiddenId !== null) {
				ctx.accessType = 'friends+';
				ctx.userId = hiddenId;
			} else if (ctx.groupId !== null) {
				ctx.accessType = 'group';
			}
			ctx.accessTypeLabel = ctx.accessType;
			// Only public / plus have their own label; `members` stays plain "group".
			if (ctx.groupId !== null && (ctx.groupAccessType === 'public' || ctx.groupAccessType === 'plus')) {
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
			return 'Public';
		case 'invite':
			return 'Invite';
		case 'invite+':
			return 'Invite+';
		case 'friends':
			return 'Friends';
		case 'friends+':
			return 'Friends+';
		case 'group':
			return 'Group';
		case 'groupPublic':
			return 'Group Public';
		case 'groupPlus':
			return 'Group Plus';
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
 * Short, human-readable instance label. Avoids showing the raw instance ID
 * (which is usually a long random hash) wherever possible.
 *
 * Returns something like:
 *   - 'Invite'               → invite-only
 *   - 'Invite+'              → invite+ (canRequestInvite)
 *   - 'Friends'              → friends-only
 *   - 'Friends+ Alice'        → friends+ with owner name
 *   - 'Group clubX'          → group instance
 *   - 'Public #abc1234'      → public with short hash
 *   - '~eu'                  → public with region only
 *   - 'shortName'            → custom shortName if present
 *
 * @param {object} L  parsed location
 * @param {string} [ownerName]  optional display name for the instance owner
 */
export function shortInstanceLabel(L, ownerName = '') {
	if (!L) return '';
	if (L.isOffline) return 'Offline';
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

/**
 * Everything the UI needs to show a place, in one object.
 *
 * kind: 'offline' | 'private' | 'traveling' | 'instance' | 'unknown'
 * (`private` also covers the literal "undefined" some payloads carry.)
 *
 * @param {string} location  VRChat location tag
 * @param {string} [worldName]  cached world name, when known
 */
export function describeLocation(location, worldName = '') {
	const tag = String(location || '');
	const L = parseLocation(tag);
	let kind = 'unknown';
	if (!tag || L.isOffline) kind = 'offline';
	else if (L.isPrivate || tag === 'undefined') kind = 'private';
	else if (L.isTraveling) kind = 'traveling';
	else if (L.isRealInstance && L.worldId) kind = 'instance';
	const real = kind === 'instance';
	return {
		kind,
		tag,
		parsed: L,
		worldId: real ? L.worldId : '',
		worldName: worldName || '',
		accessType: real ? L.accessType : '',
		accessLabel: real ? accessTypeLabel(L.accessTypeLabel) : '',
		accessClass: real ? accessTypeColor(L.accessTypeLabel) : '',
		region: real ? regionOf(L).toUpperCase() : '',
		instance: real ? shortInstanceLabel(L) : ''
	};
}
