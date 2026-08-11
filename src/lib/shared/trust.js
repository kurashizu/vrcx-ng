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
		return trustClassFromTags(f.tags);
	}
	return trustToClass(rank) || '';
}

/**
 * Derive the trust-rank CSS class from the tag list VRChat puts on users.
 * VRChat returns CUMULATIVE tags (a veteran carries basic/known/trusted/
 * veteran at once), so we pick the HIGHEST level present.
 * Map: basic/user→green, known→orange, trusted→purple, newuser→blue,
 * visitor→white, veteran→gold, legend→red.
 * @param {string[]} tags
 * @returns {string}
 */
export function trustClassFromTags(tags) {
	if (!Array.isArray(tags)) return '';
	let best = -1;
	let cls = '';
	for (const t of tags) {
		const m = String(t).match(/system_trust_([a-z_]+)/);
		if (!m) continue;
		const raw = m[1].replace(/_/g, '').trim();
		const rank = {
			visitor: 0,
			newuser: 1,
			basic: 2,
			user: 2,
			known: 3,
			trusted: 4,
			veteran: 5,
			legend: 6
		}[raw];
		if (rank === undefined) continue;
		if (rank > best) {
			best = rank;
			cls =
				raw === 'visitor'
					? 'trust-visitor'
					: raw === 'newuser'
						? 'trust-newuser'
						: raw === 'basic' || raw === 'user'
							? 'trust-user'
							: raw === 'known'
								? 'trust-known'
								: raw === 'trusted'
									? 'trust-trusted'
									: raw === 'veteran'
										? 'trust-veteran'
										: 'trust-legend';
		}
	}
	return cls;
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
		case 'basic':
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
