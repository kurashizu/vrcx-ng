import { json } from '@sveltejs/kit';
import { searchUsers, searchWorlds, searchAvatars } from '$lib/server/vrchat.js';
import { searchLocal } from '$lib/server/friends.js';
import { listSessions } from '$lib/server/accounts.js';

const MAX_PER_PAGE = 20;

/**
 * Cross-account search endpoint.
 *   GET /api/search?q=...&type=users|worlds|avatars|friends&accountId=...&offset=0
 *
 * - friends (default if no type): searches the local friend cache across
 *   all logged-in accounts, no VRChat API call, fast.
 * - users / worlds / avatars: proxies to VRChat's REST API using whichever
 *   account is logged in (accountId query param, else first available).
 */
export async function GET({ url }) {
	const q = (url.searchParams.get('q') || '').trim();
	const type = url.searchParams.get('type') || 'friends';
	const offset = parseInt(url.searchParams.get('offset') || '0', 10);
	const n = Math.min(parseInt(url.searchParams.get('n') || String(MAX_PER_PAGE), 10), 50);

	// Pick the account: explicit param > first logged-in account
	const sessions = listSessions() || {};
	const loggedInIds = Object.keys(sessions).filter((id) => sessions[id]?.user);
	const accountId = url.searchParams.get('accountId') || loggedInIds[0] || '';

	if (!q) {
		return json({ q, type, results: [], total: 0, offset, n });
	}

	try {
		if (type === 'friends') {
			const results = searchLocal(q, n);
			return json({ q, type, results, total: results.length, offset, n });
		}

		if (!accountId) {
			return json({ ok: false, error: '需要至少一个已登录账号才能搜索 VRChat API' }, { status: 400 });
		}

		const params = { search: q, n, offset };
		if (type === 'users') {
			const r = await searchUsers(accountId, params);
			return json({ q, type, accountId, results: r.data || [], ok: r.ok });
		}
		if (type === 'worlds') {
			const r = await searchWorlds(accountId, params);
			return json({ q, type, accountId, results: r.data || [], ok: r.ok });
		}
		if (type === 'avatars') {
			const r = await searchAvatars(accountId, params);
			return json({ q, type, accountId, results: r.data || [], ok: r.ok });
		}

		return json({ ok: false, error: `unknown type: ${type}` }, { status: 400 });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 500 });
	}
}