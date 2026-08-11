/**
 * @param {string} iso
 * @returns {string}
 */
export function timeAgo(iso) {
	if (!iso) return '';
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return '';
	const diff = Date.now() - t;
	const s = Math.floor(diff / 1000);
	if (s < 5) return 'just now';
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	return new Date(t).toLocaleDateString();
}

/**
 * @param {string} iso
 */
export function formatTime(iso) {
	if (!iso) return '';
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return '';
	const d = new Date(t);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Parse "wrld_xxx:instance" into a label.
 * @param {string} loc
 */
export function locationLabel(loc) {
	if (!loc) return '';
	if (loc === 'private') return 'Private World';
	if (loc === 'offline') return 'Offline';
	const [worldId, instanceId] = String(loc).split(':');
	if (!instanceId || instanceId === '0') return worldId;
	return `${worldId} · ${instanceId}`;
}
