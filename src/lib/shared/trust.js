/**
 * VRChat trust rank mapping (same rules as VRCX's computeTrustLevel).
 *
 * VRChat marks a user's rank with cumulative `system_trust_*` tags, and the
 * tag names are one level behind the rank names shown in-game:
 *
 *   system_trust_basic   → New User      (blue)    .trust-newuser
 *   system_trust_known   → User          (green)   .trust-user
 *   system_trust_trusted → Known User    (orange)  .trust-known
 *   system_trust_veteran → Trusted User  (purple)  .trust-trusted
 *   (none)               → Visitor       (grey)    .trust-visitor
 *
 * On top of that `system_troll` / `system_probable_troll` override the colour
 * (.trust-troll) and VRChat staff (`admin_moderator` tag or a non-"none"
 * `developerType`) override it again (.trust-vip). `system_trust_legend` is a
 * legacy tag that VRCX ignores, so we do too.
 *
 * The CSS classes are defined in app.css.
 *
 * @param {string[]} [tags]
 * @param {string} [developerType]
 * @returns {{ label: string, cls: string }} cls is '' when there is no rank info at all
 */
export function trustFromTags(tags, developerType) {
	const list = Array.isArray(tags) ? tags : [];
	const isStaff = list.includes('admin_moderator') || (!!developerType && developerType !== 'none');
	if (!list.length && !isStaff) return { label: '', cls: '' };

	let label = 'Visitor';
	let cls = 'trust-visitor';
	if (list.includes('system_trust_veteran')) {
		label = 'Trusted User';
		cls = 'trust-trusted';
	} else if (list.includes('system_trust_trusted')) {
		label = 'Known User';
		cls = 'trust-known';
	} else if (list.includes('system_trust_known')) {
		label = 'User';
		cls = 'trust-user';
	} else if (list.includes('system_trust_basic')) {
		label = 'New User';
		cls = 'trust-newuser';
	}
	if (list.includes('system_troll') || list.includes('system_probable_troll')) cls = 'trust-troll';
	if (isStaff) cls = 'trust-vip';
	return { label, cls };
}

/** Rank label ('New User', 'User', …) for a tag list, '' when unknown. */
export function trustLabelFromTags(tags, developerType) {
	return trustFromTags(tags, developerType).label;
}

/**
 * CSS class for a user/friend object (uses `tags` + `developerType`).
 * @param {{ tags?: string[], developerType?: string, trustRank?: string }} f
 * @returns {string} the CSS class, or '' if no rank info
 */
export function trustColor(f) {
	if (!f) return '';
	return trustFromTags(f.tags, f.developerType).cls || trustClassFromLabel(f.trustRank);
}

export function trustClassFromTags(tags, developerType) {
	return trustFromTags(tags, developerType).cls;
}

/** Fallback for objects that only carry the rank label (e.g. 'Known User'). */
function trustClassFromLabel(label) {
	switch (String(label || '').toLowerCase().replace(/\s+/g, '')) {
		case 'visitor':
			return 'trust-visitor';
		case 'newuser':
			return 'trust-newuser';
		case 'user':
			return 'trust-user';
		case 'knownuser':
			return 'trust-known';
		case 'trusteduser':
			return 'trust-trusted';
		default:
			return '';
	}
}

/**
 * Build a vrchat:// launch URL for a given world/instance (the same format
 * VRCX uses). Sentinels (offline/private/traveling/local:*) have no URL.
 * @param {string} location  e.g. "wrld_xxx:12345~private(usr_x)"
 * @param {string} [shortName]
 * @returns {string|null}
 */
export function vrcLaunchUrl(location, shortName = '') {
	if (!location || !String(location).startsWith('wrld_')) return null;
	const sn = shortName ? `&shortName=${encodeURIComponent(shortName)}` : '';
	return `vrchat://launch?ref=vrcx-ng&id=${location}${sn}`;
}
