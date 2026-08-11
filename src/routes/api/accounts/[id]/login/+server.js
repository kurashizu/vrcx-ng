import { json } from '@sveltejs/kit';
import { getAccount, getSession, setSession } from '$lib/server/accounts.js';
import { login, verify2fa, getCurrentUser } from '$lib/server/vrchat.js';
import { connectPipeline, disconnectPipeline } from '$lib/server/pipeline.js';
import { loadFriends, dropFriends } from '$lib/server/friends.js';

export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const { username, password, twoFactorCode, twoFactorMethod } = body || {};

	const acc = getAccount(params.id);
	if (!acc) return json({ error: 'Account not found' }, { status: 404 });

	// First step: log in (with or without 2FA)
	if (!twoFactorCode) {
		const r = await login(acc.id, acc.username, acc.password);
		if (r.requires2fa) {
			return json({ ok: false, requires2fa: r.requires2fa });
		}
		if (!r.ok) {
			setSession(acc.id, { lastError: r.error });
			return json({ ok: false, error: r.error }, { status: 401 });
		}
		// success
		await connectPipeline(acc.id);
		// fetch friends in the background (don't block the response)
		loadFriends(acc.id).catch((err) =>
			console.error(`friends initial load failed for ${acc.id}`, err.message)
		);
		return json({ ok: true, user: sanitize(r.user) });
	}

	// Second step: 2FA
	const method = (twoFactorMethod || 'totp').toLowerCase();
	const r = await verify2fa(acc.id, method, twoFactorCode);
	if (!r.ok) {
		setSession(acc.id, { lastError: r.error });
		return json({ ok: false, error: r.error }, { status: 401 });
	}
	const me = await getCurrentUser(acc.id);
	await connectPipeline(acc.id);
	loadFriends(acc.id).catch((err) =>
		console.error(`friends initial load failed for ${acc.id}`, err.message)
	);
	return json({ ok: true, user: sanitize(me || r.user) });
}

function sanitize(u) {
	if (!u) return null;
	return {
		id: u.id,
		displayName: u.displayName,
		username: u.username,
		currentAvatarThumbnailImageUrl: u.currentAvatarThumbnailImageUrl,
		status: u.status,
		statusDescription: u.statusDescription
	};
}
