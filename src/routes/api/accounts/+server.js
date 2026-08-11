import { json } from '@sveltejs/kit';
import { listAccounts, upsertAccount, deleteAccount, getSession, clearSession } from '$lib/server/accounts.js';
import { getAllPipelineStates, connectPipeline, disconnectPipeline } from '$lib/server/pipeline.js';
import { dropFriends } from '$lib/server/friends.js';
import { getCurrentUser } from '$lib/server/vrchat.js';

export async function GET() {
	const accounts = listAccounts();
	const sessions = getAllPipelineStates();
	const result = accounts.map((a) => {
		const sess = getSession(a.id);
		return {
			...a,
			loggedIn: !!sess?.user,
			connected: !!sessions[a.id]?.connected,
			currentUser: sess?.user
				? {
						id: sess.user.id,
						displayName: sess.user.displayName,
						currentAvatarThumbnailImageUrl: sess.user.currentAvatarThumbnailImageUrl
					}
				: null,
			lastError: sess?.lastError || null,
			lastLoginAt: sess?.lastLoginAt || null
		};
	});
	return json({ accounts: result });
}

export async function POST({ request }) {
	const body = await request.json();
	const { username, password, displayName } = body || {};
	if (!username || !password) return json({ error: 'username/password required' }, { status: 400 });
	const acc = upsertAccount({ username, displayName, password });
	return json({ account: acc });
}

export async function DELETE({ url }) {
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'id required' }, { status: 400 });
	await disconnectPipeline(id);
	dropFriends(id);
	clearSession(id);
	deleteAccount(id);
	return json({ ok: true });
}
