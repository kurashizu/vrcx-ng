import { listSessions } from '$lib/server/accounts.js';

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 VRCActivity/0.1';

const ALLOWED_HOSTS = new Set([
	'api.vrchat.cloud',
	'img.vrchat.cloud',
	'assets.vrchat.com',
	'vrchat.com'
]);

/**
 * Image proxy for VRChat media: private-avatar / friend-only thumbnails
 * require the account cookie, which browsers don't carry. Fetch server-side
 * with the session cookie and stream the bytes back with a long cache TTL.
 *
 *   GET /api/img-proxy?u=<encoded url>&account=<optional accountId>
 */
export async function GET({ url, fetch: _fetch }) {
	const u = url.searchParams.get('u');
	if (!u) return new Response('missing u', { status: 400 });

	let parsed;
	try {
		parsed = new URL(u);
	} catch {
		return new Response('bad url', { status: 400 });
	}
	if (!ALLOWED_HOSTS.has(parsed.hostname)) {
		return new Response('not allowed', { status: 403 });
	}

	// Pick a cookie: explicit account first, else any session that has one.
	const accountId = url.searchParams.get('account') || undefined;
	const sessions = listSessions() || {};
	let cookie = '';
	if (accountId && sessions[accountId]?.cookie) cookie = sessions[accountId].cookie;
	if (!cookie) {
		const first = Object.values(sessions).find((s) => s?.cookie);
		cookie = first?.cookie || '';
	}

	const headers = { 'User-Agent': USER_AGENT, Accept: '*/*' };
	if (cookie) headers.Cookie = cookie;

	let res;
	try {
		res = await fetch(u, { headers, redirect: 'follow' });
	} catch {
		return new Response('proxy error', { status: 502 });
	}

	const body = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
	const ct = res.headers.get('content-type') || 'application/octet-stream';
	return new Response(body, {
		status: res.ok ? 200 : res.status,
		headers: {
			'Content-Type': ct,
			'Cache-Control': 'public, max-age=86400',
			'Access-Control-Allow-Origin': '*'
		}
	});
}