/**
 * VRChat trust rank mapping.
 *
 * The trust rank string returned by VRChat API is e.g. 'Visitor', 'New User',
 * 'User', 'Known', 'Trusted', 'Veteran', 'Legend'. We map these to CSS
 * class names defined in app.css (`.trust-visitor` etc).
 *
 * VRCX exposes the actual rank via the user object — we look it up from
 * `friend.trustRank` (set by our server-side enrichment) or fall back to
 * whatever the Friend object already has.
 *
 * @param {{ trustRank?: string, tags?: string[] }} f
 * @returns {string} the CSS class, or '' if no rank info
 */
export function trustColor(f) {
	if (!f) return '';
	const rank = (f.trustRank || '').toLowerCase();
	if (!rank) {
		// Some VRChat fields use different casing; also accept enum-ish values
		// ('visitor', 'newuser', 'user', 'known', 'trusted', 'veteran', 'legend')
		// Try matching via tags if explicit trustRank is missing.
		if (Array.isArray(f.tags)) {
			for (const t of f.tags) {
				const cls = trustToClass(String(t).toLowerCase());
				if (cls) return cls;
			}
		}
		return '';
	}
	return trustToClass(rank) || '';
}

function trustToClass(rank) {
	const r = rank.replace(/\s+/g, '');
	switch (r) {
		case 'visitor':
			return 'trust-visitor';
		case 'newuser':
			return 'trust-newuser';
		case 'user':
			return 'trust-user';
		case 'known':
			return 'trust-known';
		case 'trusted':
			return 'trust-trusted';
		case 'veteran':
			return 'trust-veteran';
		case 'legend':
			return 'trust-legend';
		default:
			return '';
	}
}

/**
 * Build a vrc:// launch URL for a given world/instance.
 * @param {string} location  e.g. "wrld_xxx:12345"
 * @returns {string|null}
 */
export function vrcLaunchUrl(location) {
	if (!location || location === 'offline' || location === 'private') return null;
	const [worldId, instanceId] = location.split(':');
	if (!worldId) return null;
	if (instanceId && instanceId !== '0' && instanceId !== '') {
		return `vrc://launch?worldId=${encodeURIComponent(worldId)}&instanceId=${encodeURIComponent(instanceId)}`;
	}
	return `vrc://world/${encodeURIComponent(worldId)}`;
}
