/** Number with thousands separators; `?` when unknown. */
export function comma(n) {
	return n == null ? '?' : Number(n).toLocaleString();
}

/** ISO string / ms timestamp / Date → ms (NaN when it can't be parsed). */
export function toMs(t) {
	if (t == null || t === '') return NaN;
	if (typeof t === 'number') return t;
	if (t instanceof Date) return t.getTime();
	return Date.parse(t);
}

/**
 * Relative time ("5 min ago"). Pass the `now` store value to make it
 * tick; defaults to the current time.
 * @param {string|number|Date} t
 * @param {number} [now]
 */
export function timeAgo(t, now = Date.now()) {
	const ms = toMs(t);
	if (Number.isNaN(ms)) return '';
	const s = Math.floor((now - ms) / 1000);
	if (s < 5) return 'just now';
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d} d ago`;
	return new Date(ms).toLocaleDateString();
}

/** HH:MM in the browser's locale. */
export function formatTime(t) {
	const ms = toMs(t);
	return Number.isNaN(ms) ? '' : new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(t) {
	const ms = toMs(t);
	return Number.isNaN(ms) ? '' : new Date(ms).toLocaleDateString();
}

export function formatDateTime(t) {
	const ms = toMs(t);
	return Number.isNaN(ms) ? '' : new Date(ms).toLocaleString();
}

/** Human duration like "2h 05m", "3m 20s", "45s". */
export function formatDuration(ms) {
	const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
	if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
	return `${s}s`;
}

/**
 * Route VRChat image URLs through our server-side proxy so cookie-protected
 * media (private avatars, friend-only thumbnails) loads in the browser.
 * Other URLs pass through untouched.
 * @param {string} url
 * @param {string} [accountId] account whose cookie to use
 */
export function vrImage(url, accountId = '') {
	if (!url) return '';
	if (url.startsWith('/api/img-proxy') || url.startsWith('data:') || url.startsWith('blob:')) return url;
	if (/^https?:\/\/api\.vrchat\.cloud\/api\/1\//.test(url)) {
		const q = encodeURIComponent(url);
		return `/api/img-proxy?u=${q}${accountId ? `&account=${encodeURIComponent(accountId)}` : ''}`;
	}
	return url;
}

/** First letter, upper-cased — the avatar fallback. */
export function initialOf(name) {
	return String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
}

/** Stable 0–359 hue for a string (avatar fallbacks, account pips). */
export function hueOf(seed) {
	let h = 0;
	for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return h % 360;
}

/** `wrld_1234abcd-…-ef56` → `wrld_1234…ef56` */
export function shortId(id) {
	const s = String(id || '');
	return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}

/** Truncate with an ellipsis. */
export function clip(s, n) {
	const t = String(s || '');
	return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** World / avatar tags arrive as strings or `{ tag }` objects. */
export function tagList(tags) {
	return (Array.isArray(tags) ? tags : []).map((t) => (typeof t === 'string' ? t : t?.tag)).filter(Boolean);
}

/** `author_tag_cool_stuff` → `cool stuff` */
export function prettyTag(tag) {
	return String(tag).replace(/^(author_tag_|content_)/, '').replace(/_/g, ' ');
}
