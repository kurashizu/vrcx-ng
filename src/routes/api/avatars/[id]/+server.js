import { json } from '@sveltejs/kit';
import { getAvatar } from '$lib/server/vrchat.js';
import * as fav from '$lib/server/favorites.js';
import { listSessions } from '$lib/server/accounts.js';

export async function GET({ params, url }) {
	const { id } = params;
	const accountId = url.searchParams.get('accountId') || null;

	// Pick the calling account: explicit param, else any logged-in account.
	let caller = accountId;
	const sessions = listSessions();
	if (!caller) {
		const logged = Object.entries(sessions).find(([, s]) => s?.cookie);
		caller = logged?.[0] || null;
	}
	if (!caller) return json({ error: '没有已登录的账号' }, { status: 400 });

	const avatar = await getAvatar(caller, id).catch(() => null);
	if (!avatar) return json({ error: 'Avatar 不存在或不可见' }, { status: 404 });

	// Which accounts can select (change to) this avatar: any logged-in account
	// that owns it or is friends with the author can use private ones.
	const selectableAccounts = Object.entries(sessions)
		.filter(([, s]) => s?.cookie)
		.map(([aid]) => ({
			id: aid,
			displayName: sessions[aid]?.user?.displayName || aid,
			username: sessions[aid]?.user?.username || '',
			isOwner: avatar.authorId === sessions[aid]?.user?.id
		}));

	const favorites = fav.list({ type: 'avatar', targetId: id });

	return json({
		avatar: sanitize(avatar),
		isFavorite: favorites.length > 0,
		selectableAccounts
	});
}

function sanitize(a) {
	if (!a) return null;
	return {
		id: a.id,
		name: a.name,
		description: a.description,
		authorId: a.authorId,
		authorName: a.authorName,
		imageUrl: a.imageUrl,
		thumbnailImageUrl: a.thumbnailImageUrl,
		releaseStatus: a.releaseStatus,
		version: a.version,
		unityPackages: (a.unityPackages || []).map((p) => ({
			platform: p.platform,
			unityVersion: p.unityVersion,
			performanceRating: p.performanceRating,
			fileSizeInBytes: p.fileSizeInBytes
		})),
		tags: a.tags || [],
		styles: a.styles || {},
		featured: !!a.featured,
		created_at: a.created_at,
		updated_at: a.updated_at,
		unityPackageUrl: a.unityPackageUrl || ''
	};
}
