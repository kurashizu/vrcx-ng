import { json } from '@sveltejs/kit';
import {
	getUser,
	getProfile,
	getUserAvatars,
	getUserWorlds,
	getUserBadges,
	getWorld,
	getAvatar
} from '$lib/server/vrchat.js';

const TTL = 5 * 60 * 1000; // 5 minutes

/** @type {Map<string, { t: number, data: any }>} */
const cache = new Map();

function cacheKey(accountId, userId) {
	return `${accountId}:${userId}`;
}

function getCached(accountId, userId) {
	const k = cacheKey(accountId, userId);
	const entry = cache.get(k);
	if (!entry) return null;
	if (Date.now() - entry.t > TTL) {
		cache.delete(k);
		return null;
	}
	return entry.data;
}

function setCached(accountId, userId, data) {
	cache.set(cacheKey(accountId, userId), { t: Date.now(), data });
	// simple size cap
	if (cache.size > 200) {
		const first = cache.keys().next().value;
		if (first) cache.delete(first);
	}
}

export async function GET({ params }) {
	const { id, userId } = params;
	const cached = getCached(id, userId);
	if (cached) return json(cached);

	try {
		const [user, profile, avatars, worlds, badges] = await Promise.all([
			getUser(id, userId).catch(() => null),
			getProfile(id, userId).catch(() => null),
			getUserAvatars(id, userId).catch(() => []),
			getUserWorlds(id, userId).catch(() => []),
			getUserBadges(id, userId).catch(() => [])
		]);

		if (!user) return json({ error: 'User not found' }, { status: 404 });

		// VRChat often leaves currentAvatarThumbnailImageUrl empty for private
		// avatars; fetch the avatar itself (visible for friends) to fill it in.
		if (!user.currentAvatarThumbnailImageUrl && user.currentAvatar) {
			const av = await getAvatar(id, user.currentAvatar).catch(() => null);
			if (av?.thumbnailImageUrl) {
				user.currentAvatarThumbnailImageUrl = av.thumbnailImageUrl;
				user.currentAvatarImageUrl = av.imageUrl || user.currentAvatarImageUrl;
			}
		}

		// Resolve world name for the current location if there is one
		let currentWorld = null;
		if (user.location && user.location !== 'offline' && user.location !== 'private') {
			const wid = String(user.location).split(':')[0];
			if (wid?.startsWith('wrld_')) {
				currentWorld = await getWorld(id, wid).catch(() => null);
			}
		}

		const out = {
			user: sanitizeUser(user),
			profile: sanitizeProfile(profile),
			avatars: avatars.filter(Boolean).map(sanitizeAvatar).slice(0, 24),
			worlds: worlds.filter(Boolean).map(sanitizeWorld).slice(0, 24),
			badges: (badges || []).map(sanitizeBadge),
			currentWorld: currentWorld ? sanitizeWorld(currentWorld) : null,
			loadedAt: Date.now()
		};
		setCached(id, userId, out);
		return json(out);
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}

function sanitizeUser(u) {
	if (!u) return null;
	return {
		id: u.id,
		displayName: u.displayName,
		username: u.username,
		bio: u.bio,
		bioLinks: u.bioLinks,
		status: u.status,
		statusDescription: u.statusDescription,
		state: u.state,
		location: u.location,
		platform: u.platform,
		currentAvatar: u.currentAvatar,
		currentAvatarImageUrl: u.currentAvatarImageUrl,
		currentAvatarThumbnailImageUrl: u.currentAvatarThumbnailImageUrl,
		profilePicOverride: u.profilePicOverride,
		profilePicOverrideThumbnail: u.profilePicOverrideThumbnail,
		imageUrl: u.imageUrl,
		iconUrl: u.iconUrl,
		bannerUrl: u.bannerUrl,
		last_login: u.last_login,
		last_activity: u.last_activity,
		last_platform: u.last_platform,
		date_joined: u.date_joined,
		friendKey: u.friendKey,
		developerType: u.developerType,
		tags: u.tags,
		pronouns: u.pronouns,
		isFriend: u.isFriend,
		note: u.note
	};
}

function sanitizeProfile(p) {
	if (!p) return null;
	return {
		bio: p.bio,
		bioLinks: p.bioLinks,
		statusDescription: p.statusDescription,
		currentAvatarImageUrl: p.currentAvatarImageUrl,
		currentAvatarThumbnailImageUrl: p.currentAvatarThumbnailImageUrl,
		pronouns: p.pronouns
	};
}

function sanitizeAvatar(a) {
	return {
		id: a.id,
		name: a.name,
		imageUrl: a.imageUrl,
		thumbnailImageUrl: a.thumbnailImageUrl,
		releaseStatus: a.releaseStatus,
		description: a.description,
		authorName: a.authorName,
		updated_at: a.updated_at
	};
}

function sanitizeWorld(w) {
	return {
		id: w.id,
		name: w.name,
		imageUrl: w.imageUrl,
		thumbnailImageUrl: w.thumbnailImageUrl,
		releaseStatus: w.releaseStatus,
		description: w.description,
		visits: w.visits,
		favorites: w.favorites,
		occupants: w.occupants,
		privateOccupants: w.privateOccupants,
		publicOccupants: w.publicOccupants,
		updated_at: w.updated_at
	};
}

function sanitizeBadge(b) {
	return {
		badgeId: b.badgeId,
		badgeName: b.badgeName,
		badgeDescription: b.badgeDescription,
		badgeImageUrl: b.badgeImageUrl,
		assignedAt: b.assignedAt
	};
}
