import { WebSocket } from 'ws';
import { api, getWebsocketUrl, getPipelineToken, checkSession, getNotifications } from './vrchat.js';
import { listAccounts, getSession, setSession } from './accounts.js';
import { publishFeed, bus } from './bus.js';
import {
	patchFriend,
	upsertFriend,
	removeFriend,
	reconcileStates,
	loadFriends,
	lookupDisplayName,
	backfillAvatarThumbnails,
	getCachedFriend
} from './friends.js';
import { getWorldMeta } from './worldCache.js';
import {
	addNotification,
	hasNotification,
	normalizeNotificationType,
	markSeenIds,
	dismissIds,
	updateNotification
} from './notifications.js';

/**
 * Per-account realtime pipeline (wss://pipeline.vrchat.cloud) → friend cache,
 * feed entries and notifications.
 *
 * @typedef {Object} PipelineState
 * @property {string} accountId
 * @property {WebSocket|null} ws
 * @property {boolean} connected
 * @property {Promise<void>|null} connecting      // in-flight connect (single-flight)
 * @property {boolean} manualClose                // disconnectPipeline() was called: never auto-reconnect
 * @property {NodeJS.Timeout|null} reconnectTimer
 * @property {NodeJS.Timeout|null} refreshTimer
 * @property {number} attempt                     // consecutive failed connects (backoff)
 * @property {boolean} everConnected
 * @property {number} lastActivity                // ms of the last message / pong
 * @property {string} lastMessage
 * @property {Promise<void>} queue                // messages are handled strictly in order
 * @property {Map<string, any>} userCache         // last-seen profile fields, the "before" of a diff
 * @property {Map<string, string>} groupCache     // groupId -> groupName
 * @property {Map<string, NodeJS.Timeout>} pendingOffline
 * @property {Map<string, number>} onlineSince
 * @property {Map<string, string>} lastLoc        // last real location (wrld_… or 'private')
 * @property {Map<string, number>} locSince
 * @property {Map<string, number>} departedAt
 * @property {string} selfLoc
 */

/** @type {Map<string, PipelineState>} */
const states = new Map();

/** VRCX holds a friend's Offline for this long and drops it if they come back. */
const OFFLINE_HOLD_MS = 170_000;
const PING_INTERVAL_MS = 30_000;
/** No message / pong for this long means the socket is dead. */
const SILENCE_TIMEOUT_MS = 90_000;
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 5 * 60_000;
/** World / group / avatar lookups must never stall the (ordered) message queue. */
const LOOKUP_TIMEOUT_MS = 3_000;
/** REST-synced notifications older than this are stored but not announced in the feed. */
const FEED_FRESH_MS = 30 * 60_000;

function newState(accountId) {
	return {
		accountId,
		ws: null,
		connected: false,
		connecting: null,
		manualClose: false,
		reconnectTimer: null,
		refreshTimer: null,
		attempt: 0,
		everConnected: false,
		lastActivity: 0,
		lastMessage: '',
		queue: Promise.resolve(),
		userCache: new Map(),
		groupCache: new Map(),
		pendingOffline: new Map(),
		onlineSince: new Map(),
		lastLoc: new Map(),
		locSince: new Map(),
		departedAt: new Map(),
		selfLoc: ''
	};
}

/* ------------------------------- helpers ------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isWorldId = (id) => typeof id === 'string' && id.startsWith('wrld_');
const worldIdOf = (loc) => (isWorldId(loc) ? String(loc).split(':')[0] : '');
/** A location that means "in an instance" (private worlds included). */
const isRealLoc = (loc) => isWorldId(loc) || loc === 'private';
const withTimeout = (p, ms = LOOKUP_TIMEOUT_MS) => Promise.race([p, sleep(ms).then(() => null)]);

function safeJsonParse(s) {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

/** Notification `details` / `data` may be an object or a JSON string. */
function parseDetails(d) {
	if (!d) return {};
	if (typeof d === 'object') return d;
	const o = safeJsonParse(d);
	return o && typeof o === 'object' ? o : {};
}

/** Own fields that have a value (undefined / null never overwrite known data). */
function definedOnly(obj) {
	return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

/** The vrchat file id inside an avatar image URL — stable across CDN URL variants. */
function fileIdOf(url) {
	return String(url || '').match(/file_[0-9a-f-]{36}/)?.[0] || '';
}

function accountExists(accountId) {
	return listAccounts().some((a) => a.id === accountId);
}

async function resolveWorldName(state, worldId) {
	if (!isWorldId(worldId)) return '';
	const meta = await withTimeout(getWorldMeta(state.accountId, worldId));
	return meta?.name || worldId;
}

async function resolveGroupName(state, groupId) {
	if (!groupId) return '';
	const cached = state.groupCache.get(groupId);
	if (cached) return cached;
	const r = await withTimeout(api(state.accountId, `groups/${groupId}`).catch(() => null));
	const name = r?.status === 200 ? r.data?.name : '';
	if (name) state.groupCache.set(groupId, name);
	return name || '';
}

/**
 * The "before" profile of a friend: what the pipeline last saw, falling back
 * to the friend cache so the first change after a restart is a real diff
 * rather than being swallowed as a baseline.
 */
function baselineOf(state, userId) {
	let b = state.userCache.get(userId);
	if (!b) {
		const f = getCachedFriend(state.accountId, userId);
		if (f) {
			b = {
				displayName: f.displayName,
				status: f.status,
				statusDescription: f.statusDescription,
				bio: f.bio,
				currentAvatarImageUrl: f.currentAvatarImageUrl || '',
				currentAvatarThumbnailImageUrl: f.currentAvatarThumbnailImageUrl || '',
				currentAvatar: f.currentAvatar || ''
			};
			state.userCache.set(userId, b);
		}
	}
	return b;
}

/** Merge the defined fields of a user object into the cached baseline. */
function cacheUser(state, user) {
	if (!user?.id) return;
	const next = {
		...(baselineOf(state, user.id) || {}),
		...definedOnly({
			displayName: user.displayName,
			status: user.status,
			statusDescription: user.statusDescription,
			bio: user.bio,
			currentAvatarImageUrl: user.currentAvatarImageUrl,
			currentAvatarThumbnailImageUrl: user.currentAvatarThumbnailImageUrl,
			currentAvatar: user.currentAvatar
		})
	};
	if (!next.displayName) next.displayName = lookupDisplayName(user.id) || user.id;
	state.userCache.set(user.id, next);
}

function nameOf(state, userId, fallback = '') {
	return state.userCache.get(userId)?.displayName || fallback || lookupDisplayName(userId) || userId;
}

function feedEntry(state, partial) {
	const entry = {
		id: crypto.randomUUID(),
		accountId: state.accountId,
		accountDisplayName: getSession(state.accountId)?.user?.displayName || state.accountId,
		created_at: new Date().toISOString(),
		...partial
	};
	// Events sometimes carry only a userId (no user object); fill the display
	// name from the cross-account friend name cache so the feed never shows a
	// bare usr_xxx when the name is known.
	if (entry.userId && (!entry.displayName || entry.displayName === entry.userId)) {
		const name = lookupDisplayName(entry.userId);
		if (name) entry.displayName = name;
	}
	return entry;
}

function forgetPresence(state, userId) {
	state.onlineSince.delete(userId);
	state.lastLoc.delete(userId);
	state.locSince.delete(userId);
	state.departedAt.delete(userId);
}

/* --------------------------- offline hold (170 s) --------------------------- */

/** @returns {boolean} whether an Offline was pending (the friend never really left) */
function cancelPendingOffline(state, userId) {
	const t = state.pendingOffline.get(userId);
	if (!t) return false;
	clearTimeout(t);
	state.pendingOffline.delete(userId);
	return true;
}

function schedulePendingOffline(state, userId, snap) {
	if (state.pendingOffline.has(userId)) return;
	const timer = setTimeout(() => {
		state.pendingOffline.delete(userId);
		// A reconnect resync may have corrected the state while we waited
		// (missed friend-online): don't announce a stale Offline.
		const f = getCachedFriend(state.accountId, userId);
		if (f && f.state !== 'offline') return;
		publishFeed(
			feedEntry(state, {
				type: 'Offline',
				userId,
				displayName: snap.displayName,
				location: snap.location,
				worldId: worldIdOf(snap.location),
				worldName: snap.worldName,
				platform: snap.platform,
				time: snap.time || undefined,
				userThumbnailUrl: snap.thumb
			})
		);
	}, OFFLINE_HOLD_MS);
	timer.unref?.();
	state.pendingOffline.set(userId, timer);
}

function clearPresenceTimers(state) {
	for (const t of state.pendingOffline.values()) clearTimeout(t);
	state.pendingOffline.clear();
}

/* ------------------------------ notifications ------------------------------ */

/**
 * Store one VRChat notification (V1 websocket `notification`, V2
 * `notification-v2`, or a REST poll) and announce it in the feed — only when
 * it is new, so the websocket and the poller can't double-report it.
 * @param {PipelineState} state
 * @param {any} n  raw VRChat notification
 * @param {{ announce?: boolean }} [opts]  announce=false: store only
 * @returns {Promise<boolean>} whether it was new
 */
async function ingestNotification(state, n, { announce = true } = {}) {
	if (!n?.type) return false;
	const t = normalizeNotificationType(n.type);
	const details = parseDetails(n.details || n.data);
	const senderUserId = details.senderUserId || n.senderUserId || '';
	const senderName = details.senderDisplayName || n.senderDisplayName || n.senderUsername || '';
	// Invite details carry the full location tag in `worldId` ("wrld_x:123~…").
	let loc = String(details.worldId || '');
	if (loc && !loc.includes(':') && details.instanceId) loc = `${loc}:${details.instanceId}`;
	const worldId = worldIdOf(loc);
	const instanceId = loc.includes(':') ? loc.slice(loc.indexOf(':') + 1) : '';
	const worldName = details.worldName || (worldId ? await resolveWorldName(state, worldId) : '');
	const message =
		n.message ||
		details.inviteMessage ||
		details.requestMessage ||
		details.responseMessage ||
		details.message ||
		n.title ||
		'';

	let inserted = true;
	try {
		inserted = addNotification({
			id: n.id,
			createdAt: n.created_at ?? n.createdAt,
			accountId: state.accountId,
			type: t,
			senderUserId,
			senderDisplayName: senderName,
			senderUsername: n.senderUsername || '',
			worldId,
			worldName,
			instanceId,
			groupId: details.groupId || n.groupId || '',
			message,
			raw: n
		});
	} catch (err) {
		console.error(`[pipeline ${state.accountId}] storing notification failed`, err.message);
	}
	if (!inserted) return false;

	bus.emit('notifications');
	if (!announce) return true;

	const base = { userId: senderUserId, displayName: senderName, raw: n };
	if (t === 'friendRequest') {
		publishFeed(feedEntry(state, { type: 'FriendRequest', ...base }));
	} else if (t === 'invite' || t === 'requestInvite') {
		publishFeed(
			feedEntry(state, {
				type: 'Invite',
				...base,
				location: loc,
				worldId,
				worldName,
				detail: message
			})
		);
	} else {
		publishFeed(feedEntry(state, { type: 'Notification', ...base, detail: message || t }));
	}
	return true;
}

/**
 * REST fallback: pull notifications for one account and surface any not
 * already stored. The websocket usually delivers these, but it can miss some
 * (or the pipeline may have been down). Both generations are polled: the V1
 * `auth/user/notifications` (invites, friend requests, …) and the V2
 * `notifications` endpoint.
 * @param {PipelineState} state
 */
async function syncNotifications(state) {
	const v1 = await api(state.accountId, 'auth/user/notifications', { params: { n: 100 } }).catch(() => null);
	const lists = [
		Array.isArray(v1?.data) ? v1.data : [],
		await getNotifications(state.accountId, { n: 100 }).catch(() => [])
	];
	for (const list of lists) {
		for (const n of list) {
			if (!n?.id || n.seen || hasNotification(n.id, state.accountId)) continue;
			const created = Date.parse(n.created_at || n.createdAt || '') || Date.now();
			await ingestNotification(state, n, { announce: Date.now() - created < FEED_FRESH_MS });
		}
	}
}

/* ---------------------- pipeline message handler ---------------------- */

/**
 * @param {PipelineState} state
 * @param {{ type: string, content: any }} msg
 */
async function handleMessage(state, msg) {
	if (!msg || typeof msg !== 'object') return;
	const { type, content } = msg;
	if (!content) return;
	const accountId = state.accountId;
	const now = Date.now();

	switch (type) {
		case 'friend-online': {
			const userId = content.userId;
			if (!userId) break;
			// Back within the hold window: they never really left — no Offline,
			// and no Online either (same as VRCX).
			const reconnected = cancelPendingOffline(state, userId);
			cacheUser(state, content.user);
			const user = state.userCache.get(userId) || { displayName: nameOf(state, userId) };
			const loc = content.location || 'offline';
			const dest = content.travelingToLocation || '';
			const effLoc = loc === 'traveling' && dest ? dest : loc;
			const wid = isWorldId(content.worldId) ? content.worldId : worldIdOf(effLoc);
			const worldName = wid ? await resolveWorldName(state, wid) : '';
			patchFriend(accountId, userId, {
				state: 'online',
				location: loc,
				travelingToLocation: dest,
				worldName,
				displayName: user.displayName,
				platform: content.platform,
				status: content.user?.status,
				statusDescription: content.user?.statusDescription,
				currentAvatarThumbnailImageUrl: user.currentAvatarThumbnailImageUrl,
				currentAvatarImageUrl: user.currentAvatarImageUrl,
				tags: content.user?.tags,
				developerType: content.user?.developerType
			});
			if (!reconnected) {
				forgetPresence(state, userId);
				state.onlineSince.set(userId, now);
			}
			if (isRealLoc(effLoc) && (!reconnected || !state.lastLoc.has(userId))) {
				state.lastLoc.set(userId, effLoc);
				state.locSince.set(userId, now);
			}
			if (!reconnected) {
				publishFeed(
					feedEntry(state, {
						type: 'Online',
						userId,
						displayName: user.displayName,
						location: effLoc === 'offline' ? '' : effLoc,
						worldId: wid,
						worldName,
						platform: content.platform,
						userThumbnailUrl: user.currentAvatarThumbnailImageUrl || ''
					})
				);
			}
			break;
		}
		case 'friend-active': {
			const userId = content.userId;
			if (!userId) break;
			cancelPendingOffline(state, userId);
			cacheUser(state, content.user);
			const user = state.userCache.get(userId) || {};
			forgetPresence(state, userId);
			patchFriend(accountId, userId, {
				state: 'active',
				location: 'offline',
				travelingToLocation: '',
				worldName: '',
				displayName: content.user?.displayName,
				platform: content.platform,
				currentAvatarThumbnailImageUrl: content.user?.currentAvatarThumbnailImageUrl
			});
			publishFeed(
				feedEntry(state, {
					type: 'Active',
					userId,
					displayName: nameOf(state, userId, content.user?.displayName),
					platform: content.platform,
					userThumbnailUrl: user.currentAvatarThumbnailImageUrl || ''
				})
			);
			break;
		}
		case 'friend-offline': {
			const userId = content.userId;
			if (!userId) break;
			cacheUser(state, content.user);
			const f = getCachedFriend(accountId, userId);
			const base = state.userCache.get(userId);
			const since = state.onlineSince.get(userId);
			// Snapshot now: the cache is flipped to offline right away (the truth
			// for the friend list) but the feed entry is held back — see below.
			const snap = {
				displayName: nameOf(state, userId, f?.displayName),
				location: state.lastLoc.get(userId) || (isRealLoc(f?.location) ? f.location : ''),
				worldName: f?.worldName || '',
				platform: content.platform || f?.platform || '',
				thumb: base?.currentAvatarThumbnailImageUrl || f?.currentAvatarThumbnailImageUrl || '',
				time: since ? now - since : 0
			};
			patchFriend(accountId, userId, {
				state: 'offline',
				location: 'offline',
				travelingToLocation: '',
				worldName: '',
				displayName: snap.displayName
			});
			forgetPresence(state, userId);
			schedulePendingOffline(state, userId, snap);
			break;
		}
		case 'friend-location': {
			const userId = content.userId;
			if (!userId) break;
			const loc = content.location;
			if (!loc || loc === 'offline') break;
			cancelPendingOffline(state, userId);
			cacheUser(state, content.user);
			const f = getCachedFriend(accountId, userId);
			const name = nameOf(state, userId, f?.displayName);
			const user = state.userCache.get(userId) || {};
			if (!state.onlineSince.has(userId)) state.onlineSince.set(userId, now);

			if (loc === 'traveling') {
				// Mid-hop: remember where they're going and when they left, but
				// don't emit a GPS entry — the arrival does (one entry per hop).
				patchFriend(accountId, userId, {
					state: 'online',
					location: 'traveling',
					travelingToLocation: content.travelingToLocation || '',
					displayName: name,
					platform: content.platform
				});
				if (state.lastLoc.has(userId) && !state.departedAt.has(userId)) state.departedAt.set(userId, now);
				break;
			}

			const wid = isWorldId(content.worldId) ? content.worldId : worldIdOf(loc);
			const worldName = wid ? await resolveWorldName(state, wid) : '';
			const prevLoc = state.lastLoc.get(userId) ?? (isRealLoc(f?.location) ? f.location : '');
			patchFriend(accountId, userId, {
				state: 'online',
				location: loc,
				travelingToLocation: '',
				worldName,
				displayName: name,
				platform: content.platform,
				status: content.user?.status,
				statusDescription: content.user?.statusDescription,
				currentAvatarThumbnailImageUrl: user.currentAvatarThumbnailImageUrl
			});
			if (isRealLoc(loc) && loc !== prevLoc) {
				// time spent at the previous place: arrival → departure (travel time excluded)
				const left = state.departedAt.get(userId) || now;
				const arrived = state.locSince.get(userId);
				const previousWorldName = isWorldId(prevLoc) ? await resolveWorldName(state, worldIdOf(prevLoc)) : '';
				publishFeed(
					feedEntry(state, {
						type: 'GPS',
						userId,
						displayName: name,
						location: loc,
						previousLocation: prevLoc,
						previousWorldName,
						worldId: wid,
						worldName,
						platform: content.platform,
						time: arrived ? Math.max(0, left - arrived) : undefined,
						userThumbnailUrl: user.currentAvatarThumbnailImageUrl || ''
					})
				);
			}
			if (isRealLoc(loc)) {
				if (loc !== prevLoc || !state.locSince.has(userId)) state.locSince.set(userId, now);
				state.lastLoc.set(userId, loc);
			}
			state.departedAt.delete(userId);
			break;
		}
		case 'friend-update': {
			const userId = content.userId;
			const u = content.user;
			if (!userId || !u) break;
			const before = { ...(baselineOf(state, userId) || {}) };
			const known = Object.keys(before).length > 0;
			cacheUser(state, { ...u, id: userId });
			const after = state.userCache.get(userId);
			patchFriend(accountId, userId, {
				displayName: u.displayName,
				status: u.status,
				statusDescription: u.statusDescription,
				bio: u.bio,
				currentAvatarThumbnailImageUrl: u.currentAvatarThumbnailImageUrl,
				currentAvatarImageUrl: u.currentAvatarImageUrl,
				currentAvatar: u.currentAvatar,
				tags: u.tags,
				developerType: u.developerType,
				platform: u.platform
			});
			if (!known) break; // nothing to diff against yet

			const common = {
				userId,
				displayName: after.displayName || before.displayName,
				userThumbnailUrl: after.currentAvatarThumbnailImageUrl || ''
			};
			// Avatar: compare the image's file id (the URL itself can vary).
			const bImg = before.currentAvatarImageUrl;
			const aImg = after.currentAvatarImageUrl;
			if (bImg && aImg && bImg !== aImg && (fileIdOf(bImg) !== fileIdOf(aImg) || !fileIdOf(aImg))) {
				const av = u.currentAvatar
					? await withTimeout(api(accountId, `avatars/${u.currentAvatar}`).catch(() => null))
					: null;
				publishFeed(
					feedEntry(state, {
						type: 'Avatar',
						...common,
						avatarName: (av?.status === 200 && av.data?.name) || '',
						currentAvatarImageUrl: aImg,
						currentAvatarThumbnailImageUrl: after.currentAvatarThumbnailImageUrl,
						previousCurrentAvatarImageUrl: bImg,
						previousCurrentAvatarThumbnailImageUrl: before.currentAvatarThumbnailImageUrl
					})
				);
			}
			// Status and its description are separate changes.
			if (
				(before.status != null && after.status != null && before.status !== after.status) ||
				(before.statusDescription != null &&
					after.statusDescription != null &&
					before.statusDescription !== after.statusDescription)
			) {
				publishFeed(
					feedEntry(state, {
						type: 'Status',
						...common,
						status: after.status,
						statusDescription: after.statusDescription,
						previousStatus: before.status,
						previousStatusDescription: before.statusDescription
					})
				);
			}
			if (before.bio != null && after.bio != null && before.bio !== after.bio) {
				publishFeed(
					feedEntry(state, {
						type: 'Bio',
						...common,
						bio: after.bio,
						previousBio: before.bio
					})
				);
			}
			break;
		}
		case 'user-update': {
			// Own profile changed. Friend states are NOT derived from this payload.
			if (!content.user) break;
			const sess = getSession(accountId);
			if (sess) {
				setSession(accountId, { user: { ...(sess.user || {}), ...definedOnly(content.user) } });
				bus.emit('accounts');
			}
			break;
		}
		case 'user-location': {
			const sess = getSession(accountId);
			if (!sess?.user) break;
			if (content.userId && content.userId !== sess.user.id) break;
			const loc = content.location;
			if (!loc) break;
			// Persist the position on the account session — this is what
			// powers the "my current instance" aggregation (self-invite to
			// private/friends instances you are in) and the account bar.
			const dest = content.travelingToLocation || '';
			if (loc !== sess.user.location || dest !== (sess.user.travelingToLocation || '')) {
				setSession(accountId, { user: { ...sess.user, location: loc, travelingToLocation: dest } });
				bus.emit('accounts');
			}
			if (loc === 'offline') state.selfLoc = '';
			if (isRealLoc(loc) && loc !== state.selfLoc) {
				state.selfLoc = loc;
				const wid = worldIdOf(loc);
				const worldName = wid ? await resolveWorldName(state, wid) : '';
				publishFeed(
					feedEntry(state, {
						type: 'GPS',
						userId: sess.user.id,
						displayName: sess.user.displayName,
						location: loc,
						worldId: wid,
						worldName,
						raw: { self: true }
					})
				);
			}
			break;
		}
		case 'notification':
		case 'notification-v2': {
			await ingestNotification(state, content);
			break;
		}
		case 'notification-v2-delete': {
			// { ids: [...] } — hidden/removed elsewhere (e.g. responded to)
			const ids = Array.isArray(content.ids) ? content.ids : [];
			markSeenIds(accountId, ids);
			dismissIds(accountId, ids);
			bus.emit('notifications');
			break;
		}
		case 'notification-v2-update': {
			// { id, updates } — merge into the stored notification
			if (content.id && updateNotification(accountId, content.id, content.updates)) {
				bus.emit('notifications');
			}
			break;
		}
		case 'see-notification': {
			const id = typeof content === 'string' ? content : content.notificationId || content.id;
			if (id) markSeenIds(accountId, [id]);
			bus.emit('notifications');
			break;
		}
		case 'hide-notification': {
			const id = typeof content === 'string' ? content : content.notificationId || content.id;
			if (id) {
				markSeenIds(accountId, [id]);
				dismissIds(accountId, [id]);
			}
			bus.emit('notifications');
			break;
		}
		case 'response-notification': {
			const id = content.notificationId;
			if (id) {
				markSeenIds(accountId, [id]);
				dismissIds(accountId, [id]);
			}
			bus.emit('notifications');
			break;
		}
		case 'instance-closed': {
			publishFeed(
				feedEntry(state, {
					type: 'Instance.Closed',
					location: content.instanceLocation,
					raw: content
				})
			);
			break;
		}
		case 'friend-add': {
			// Someone is now our friend. content.user is the new friend.
			const u = content.user;
			const userId = content.userId || u?.id;
			if (!userId) break;
			if (u?.id) cacheUser(state, u);
			upsertFriend(accountId, {
				id: userId,
				displayName: u?.displayName || lookupDisplayName(userId) || undefined,
				currentAvatarThumbnailImageUrl: u?.currentAvatarThumbnailImageUrl,
				currentAvatarImageUrl: u?.currentAvatarImageUrl,
				status: u?.status,
				statusDescription: u?.statusDescription,
				bio: u?.bio,
				state: 'offline',
				location: 'offline',
				platform: u?.platform,
				tags: u?.tags,
				developerType: u?.developerType
			});
			publishFeed(
				feedEntry(state, {
					type: 'Friend',
					userId,
					displayName: nameOf(state, userId, u?.displayName),
					detail: 'Added as a friend',
					raw: { subtype: 'friend-add' }
				})
			);
			break;
		}
		case 'friend-delete': {
			// Someone is no longer our friend.
			const userId = content.userId || content.user?.id;
			if (!userId) break;
			const name = nameOf(state, userId, getCachedFriend(accountId, userId)?.displayName);
			cancelPendingOffline(state, userId);
			forgetPresence(state, userId);
			removeFriend(accountId, userId);
			publishFeed(
				feedEntry(state, {
					type: 'Friend',
					userId,
					displayName: name,
					detail: 'Removed from friends',
					raw: { subtype: 'friend-delete' }
				})
			);
			break;
		}
		case 'group-joined': {
			const groupId = content.groupId;
			if (!groupId) break;
			const name = await resolveGroupName(state, groupId);
			publishFeed(
				feedEntry(state, {
					type: 'Group',
					detail: `Joined group ${name || groupId}`,
					groupName: name,
					raw: content
				})
			);
			break;
		}
		case 'group-left': {
			const groupId = content.groupId;
			if (!groupId) break;
			const name = state.groupCache.get(groupId) || '';
			state.groupCache.delete(groupId);
			publishFeed(
				feedEntry(state, {
					type: 'Group',
					detail: `Left group ${name || groupId}`,
					groupName: name,
					raw: content
				})
			);
			break;
		}
		case 'group-role-updated': {
			const role = content.role || {};
			const name = await resolveGroupName(state, role.groupId);
			publishFeed(
				feedEntry(state, {
					type: 'Group',
					detail: `Role updated${role.name ? `: ${role.name}` : ''}${name ? ` in ${name}` : ''}`,
					groupName: name,
					raw: content
				})
			);
			break;
		}
		case 'group-member-updated': {
			// Our own membership in a group changed (role / visibility / …).
			const member = content.member;
			if (!member) break;
			const name = await resolveGroupName(state, member.groupId);
			publishFeed(
				feedEntry(state, {
					type: 'Group',
					detail: `Group membership updated${name ? `: ${name}` : ''}`,
					groupName: name,
					raw: content
				})
			);
			break;
		}
		case 'instance-queue-joined': {
			publishFeed(
				feedEntry(state, {
					type: 'Notification',
					detail: `Joined instance queue at ${content.instanceLocation || '?'}`,
					raw: content
				})
			);
			break;
		}
		case 'instance-queue-position': {
			// Periodic position update — VRChat sends these often, not announced.
			break;
		}
		case 'instance-queue-ready': {
			publishFeed(
				feedEntry(state, {
					type: 'Notification',
					detail: `Instance queue ready: ${content.instanceLocation || '?'}`,
					raw: content
				})
			);
			break;
		}
		case 'instance-queue-left': {
			publishFeed(
				feedEntry(state, {
					type: 'Notification',
					detail: 'Left instance queue',
					raw: content
				})
			);
			break;
		}
		case 'content-refresh': {
			// VRChat tells clients that worlds/avatars/files changed; our caches
			// expire on their own, so this is only logged.
			console.log(`[pipeline ${accountId}] content-refresh: ${content.contentType || '?'}`);
			break;
		}
		default:
			break;
	}
}

/** Messages are handled strictly one after another (per account). */
function enqueue(state, raw) {
	state.queue = state.queue
		.then(async () => {
			const data = raw.toString();
			if (state.lastMessage === data) return;
			state.lastMessage = data;
			const msg = safeJsonParse(data);
			if (!msg) return;
			if (typeof msg.content === 'string') {
				const inner = safeJsonParse(msg.content);
				if (inner && typeof inner === 'object') msg.content = inner;
			}
			await handleMessage(state, msg);
		})
		.catch((err) => console.error(`[pipeline ${state.accountId}] handler error`, err));
}

/* --------------------- connection lifecycle --------------------- */

function markError(state, message) {
	// never resurrect a session for an account that was deleted
	if (accountExists(state.accountId)) setSession(state.accountId, { lastError: message });
	bus.emit('accounts');
}

function stopTimers(state) {
	if (state.refreshTimer) clearInterval(state.refreshTimer);
	state.refreshTimer = null;
}

function startTimers(state, ws) {
	stopTimers(state);
	let tick = 0;
	state.refreshTimer = setInterval(() => {
		if (state.ws !== ws) return;
		// a socket that answers neither messages nor pings is dead
		if (Date.now() - state.lastActivity > SILENCE_TIMEOUT_MS) {
			console.warn(`[pipeline ${state.accountId}] no activity for ${SILENCE_TIMEOUT_MS / 1000}s, terminating`);
			ws.terminate();
			return;
		}
		try {
			ws.ping();
		} catch {}
		tick++;
		// REST notification sync every ~90s: the websocket can silently drop events.
		if (tick % 3 === 0) syncNotifications(state).catch(() => {});
		// occasionally backfill missing avatar thumbnails (private avatars)
		if (tick % 5 === 0) backfillAvatarThumbnails(state.accountId, 8).catch(() => {});
	}, PING_INTERVAL_MS);
	state.refreshTimer.unref?.();
}

/**
 * Connect (or no-op if already connected / connecting). Safe to call
 * concurrently: callers share one in-flight attempt.
 * @param {string} accountId
 * @returns {Promise<void>}
 */
export function connectPipeline(accountId) {
	let state = states.get(accountId);
	if (!state) {
		state = newState(accountId);
		states.set(accountId, state);
	}
	state.manualClose = false;
	if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
		return Promise.resolve();
	}
	if (state.connecting) return state.connecting;
	const st = state;
	st.connecting = doConnect(st)
		.catch((err) => {
			console.error(`[pipeline ${accountId}] connect failed`, err.message);
			scheduleReconnect(st);
		})
		.finally(() => {
			st.connecting = null;
		});
	return st.connecting;
}

/** @param {PipelineState} state */
async function doConnect(state) {
	const accountId = state.accountId;
	if (!accountExists(accountId)) {
		state.manualClose = true;
		return;
	}

	let check;
	try {
		check = await checkSession(accountId);
	} catch (err) {
		// DNS / network not ready (typical right after boot) → retry with backoff.
		console.error(`[pipeline ${accountId}] auth check failed`, err.message);
		if (state.manualClose) return;
		markError(state, `Auth check failed: ${err.message}`);
		scheduleReconnect(state);
		return;
	}
	if (state.manualClose) return;
	if (!check.ok) {
		if (check.definite) {
			// Dead session (relogin failed / needs 2FA): retrying would only hammer
			// VRChat with a bad password. Wait for a manual login.
			console.log(`[pipeline ${accountId}] not logged in, skip (${check.error})`);
			markError(state, 'Not logged in (cookie invalid)');
		} else {
			console.warn(`[pipeline ${accountId}] auth check transient failure: ${check.error}`);
			markError(state, `Auth check failed: ${check.error}`);
			scheduleReconnect(state);
		}
		return;
	}
	const me = check.user;
	setSession(accountId, { lastError: null });
	// If the cache already has friends (from a previous session), reconcile
	// their state against the fresh onlineFriends/activeFriends right away.
	reconcileStates(accountId, {
		activeFriends: me.activeFriends,
		onlineFriends: me.onlineFriends
	});

	let token;
	try {
		token = await getPipelineToken(accountId);
	} catch (err) {
		console.error(`[pipeline ${accountId}] getPipelineToken failed`, err.message);
	}
	if (state.manualClose) return;
	if (!token) {
		console.log(`[pipeline ${accountId}] no pipeline token`);
		markError(state, 'VRChat did not return a pipeline token');
		scheduleReconnect(state);
		return;
	}

	const ws = new WebSocket(`${getWebsocketUrl()}/?auth=${token}`, {
		headers: { 'User-Agent': 'VRCActivity/0.1' },
		handshakeTimeout: 15_000
	});
	state.ws = ws;

	ws.on('open', () => {
		if (state.ws !== ws) return ws.terminate();
		state.connected = true;
		state.attempt = 0;
		state.lastActivity = Date.now();
		const wasReconnect = state.everConnected;
		state.everConnected = true;
		console.log(`[pipeline ${accountId}] connected`);
		startTimers(state, ws);
		// Events may have been missed while the socket was down: resync the
		// friend cache from the API (boot and login load it themselves).
		if (wasReconnect) loadFriends(accountId);
		syncNotifications(state).catch((err) =>
			console.error(`[pipeline ${accountId}] notification sync failed`, err.message)
		);
		bus.emit('accounts');
	});

	// With this listener ws no longer aborts the handshake by itself, so a
	// rejected upgrade (expired token, 429, …) must be terminated explicitly —
	// that produces the close event that drives the reconnect.
	ws.on('unexpected-response', (_req, res) => {
		console.error(`[pipeline ${accountId}] unexpected-response ${res.statusCode}`);
		markError(state, `Pipeline handshake failed: HTTP ${res.statusCode}`);
		ws.terminate();
	});

	ws.on('pong', () => {
		state.lastActivity = Date.now();
	});

	ws.on('message', (raw) => {
		state.lastActivity = Date.now();
		enqueue(state, raw);
	});

	ws.on('close', (code, reason) => {
		// A socket that was already replaced / closed on purpose must not touch state.
		if (state.ws !== ws) return;
		state.ws = null;
		state.connected = false;
		stopTimers(state);
		console.log(`[pipeline ${accountId}] disconnected code=${code} reason=${reason}, scheduling reconnect`);
		bus.emit('accounts');
		scheduleReconnect(state);
	});

	ws.on('error', (err) => {
		console.error(`[pipeline ${accountId}] ws error`, err.message);
	});
}

/** Exponential backoff: 5s, 10s, 20s … capped at 5 min; reset by a successful open. */
function scheduleReconnect(state) {
	if (state.manualClose || state.reconnectTimer) return;
	const delay = Math.min(RECONNECT_BASE_MS * 2 ** Math.min(state.attempt, 6), RECONNECT_MAX_MS);
	state.attempt++;
	state.reconnectTimer = setTimeout(() => {
		state.reconnectTimer = null;
		connectPipeline(state.accountId);
	}, delay);
	state.reconnectTimer.unref?.();
}

export async function disconnectPipeline(accountId) {
	const state = states.get(accountId);
	if (!state) return;
	state.manualClose = true;
	if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
	state.reconnectTimer = null;
	stopTimers(state);
	clearPresenceTimers(state);
	for (const m of [state.onlineSince, state.lastLoc, state.locSince, state.departedAt]) m.clear();
	state.selfLoc = '';
	const ws = state.ws;
	const hadConnection = !!ws || state.connected;
	state.ws = null; // its close event is now ignored (identity check)
	state.connected = false;
	if (ws) {
		try {
			ws.close();
		} catch {}
		setTimeout(() => {
			try {
				ws.terminate();
			} catch {}
		}, 2000).unref?.();
	}
	if (hadConnection) bus.emit('accounts');
}

export function getPipelineState(accountId) {
	const state = states.get(accountId);
	return state ? { connected: state.connected } : { connected: false };
}

export function getAllPipelineStates() {
	const out = {};
	for (const a of listAccounts()) out[a.id] = { connected: states.get(a.id)?.connected ?? false };
	return out;
}

/**
 * On server boot, try to reconnect every account that already has a stored cookie.
 */
export async function bootstrapAll() {
	for (const a of listAccounts()) {
		const sess = getSession(a.id);
		if (sess?.cookie) {
			connectPipeline(a.id)
				.then(() => bus.emit('accounts'))
				.catch((err) => console.error(`bootstrap ${a.id} failed`, err.message));
		}
	}
	// also make sure the initial 'hello' has fresh state on first connect
	bus.emit('accounts');
}
