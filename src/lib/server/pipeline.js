import { WebSocket } from 'ws';
import { getWebsocketUrl, getPipelineToken, getCurrentUser, getWorld, getNotifications } from './vrchat.js';
import { listAccounts, getSession, setSession } from './accounts.js';
import { publishFeed, bus } from './bus.js';
import { patchFriend, reconcileStates, loadFriends, removeFriend, lookupDisplayName } from './friends.js';
import { getWorldMeta } from './worldCache.js';
import { addNotification, hasNotification, normalizeNotificationType } from './notifications.js';

/**
 * @typedef {Object} PipelineState
 * @property {string} accountId
 * @property {WebSocket|null} ws
 * @property {NodeJS.Timeout|null} reconnectTimer
 * @property {NodeJS.Timeout|null} refreshTimer
 * @property {string|null} lastMessage
 * @property {boolean} connected
 * @property {Map<string, { displayName: string, status: string, statusDescription: string, bio: string, currentAvatarImageUrl: string, currentAvatarThumbnailImageUrl: string, currentAvatar: string, location: string }>} userCache
 * @property {Map<string, string>} worldCache   // worldId -> worldName
 * @property {Map<string, string>} groupCache   // groupId -> groupName
 */

/** @type {Map<string, PipelineState>} */
const states = new Map();

function newState(accountId) {
	return {
		accountId,
		ws: null,
		reconnectTimer: null,
		refreshTimer: null,
		lastMessage: '',
		connected: false,
		userCache: new Map(),
		worldCache: new Map(),
		groupCache: new Map()
	};
}

function safeJsonParse(s) {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

function parseLocation(loc) {
	if (!loc) return { worldId: null, instanceId: null };
	const [worldId, instanceId] = String(loc).split(':');
	return { worldId: worldId || null, instanceId: instanceId || null };
}

async function resolveWorldName(state, worldId) {
	if (!worldId) return '';
	const meta = await getWorldMeta(state.accountId, worldId);
	const name = meta?.name || worldId;
	state.worldCache.set(worldId, name);
	return name;
}

function cacheUser(state, user) {
	if (!user?.id) return;
	const prev = state.userCache.get(user.id) || {};
	state.userCache.set(user.id, {
		displayName: user.displayName || prev.displayName || user.id,
		status: user.status ?? prev.status ?? '',
		statusDescription: user.statusDescription ?? prev.statusDescription ?? '',
		bio: user.bio ?? prev.bio ?? '',
		currentAvatarImageUrl: user.currentAvatarImageUrl ?? prev.currentAvatarImageUrl ?? '',
		currentAvatarThumbnailImageUrl:
			user.currentAvatarThumbnailImageUrl ?? prev.currentAvatarThumbnailImageUrl ?? '',
		currentAvatar: user.currentAvatar ?? prev.currentAvatar ?? '',
		location: user.location ?? prev.location ?? ''
	});
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

/* ---------------------- pipeline message handler ---------------------- */

/**
 * @param {PipelineState} state
 * @param {{ type: string, content: any }} msg
 */
/**
 * REST fallback: pull unseen notifications for one account and surface any
 * not already stored. The websocket usually delivers these as
 * notification-v2, but it can miss some (or the pipeline may have been down).
 * @param {import('./pipeline.js').PipelineState} state
 */
async function syncNotifications(state) {
	const list = await getNotifications(state.accountId, { n: 25 });
	if (!Array.isArray(list)) return;
	for (const n of list) {
		if (!n?.id || n.seen || hasNotification(n.id, state.accountId)) continue;
		const t = normalizeNotificationType(n.type);
		const supported =
			t === 'friendRequest' ||
			t === 'invite' ||
			t === 'requestInvite' ||
			t === 'message' ||
			t === 'groupAnnouncement';
		if (!supported) continue;
		const worldId = n.details?.worldId || '';
		const worldName = worldId ? await resolveWorldName(state, worldId) : '';
		addNotification({
			id: n.id,
			accountId: state.accountId,
			type: t,
			senderUserId: n.senderUserId || '',
			senderDisplayName: n.senderDisplayName || n.senderUsername || '',
			senderUsername: n.senderUsername || '',
			worldId,
			worldName,
			instanceId: n.details?.instanceId || '',
			message: n.message || '',
			raw: n
		});
		publishFeed(
			feedEntry(state, {
				type: t === 'friendRequest' ? 'FriendRequest' : t === 'invite' || t === 'requestInvite' ? 'Invite' : 'Notification',
				userId: n.senderUserId || '',
				displayName: n.senderDisplayName || n.senderUsername || n.senderUserId || '',
				location: worldId ? `${worldId}:${n.details?.instanceId || ''}` : '',
				worldName,
				raw: n
			})
		);
		bus.emit('notifications');
	}
}

async function handleMessage(state, msg) {
	if (!msg || typeof msg !== 'object') return;
	const { type, content } = msg;
	if (!content) return;

	switch (type) {
		case 'friend-online': {
			const userId = content.userId;
			cacheUser(state, content.user || {});
			const user = state.userCache.get(userId) || { displayName: userId };
			const loc = content.location || 'offline';
			state.userCache.set(userId, { ...user, location: loc });
			const worldName = content.worldId ? await resolveWorldName(state, content.worldId) : '';
			patchFriend(state.accountId, userId, {
				state: 'online',
				location: loc,
				worldName,
				displayName: user.displayName,
				platform: content.platform,
				currentAvatarThumbnailImageUrl: user.currentAvatarThumbnailImageUrl
			});
			publishFeed(
				feedEntry(state, {
					type: 'Online',
					userId,
					displayName: user.displayName,
					location: loc === 'offline' ? '' : loc,
					worldId: content.worldId,
					worldName,
					userThumbnailUrl: user.currentAvatarThumbnailImageUrl || ''
				})
			);
			break;
		}
		case 'friend-active': {
			const userId = content.userId;
			cacheUser(state, content.user || {});
			const user = state.userCache.get(userId) || {};
			patchFriend(state.accountId, userId, {
				state: 'active',
				location: 'offline',
				displayName: content.user?.displayName,
				currentAvatarThumbnailImageUrl: content.user?.currentAvatarThumbnailImageUrl
			});
			publishFeed(
				feedEntry(state, {
					type: 'Active',
					userId,
					displayName: content.user?.displayName || userId,
					userThumbnailUrl: user.currentAvatarThumbnailImageUrl || ''
				})
			);
			break;
		}
		case 'friend-offline': {
			const userId = content.userId;
			cacheUser(state, { id: userId, displayName: content.user?.displayName });
			const prev = state.userCache.get(userId);
			patchFriend(state.accountId, userId, {
				state: 'offline',
				location: 'offline',
				displayName: prev?.displayName || content.user?.displayName
			});
			publishFeed(
				feedEntry(state, {
					type: 'Offline',
					userId,
					displayName: prev?.displayName || content.user?.displayName || userId,
					userThumbnailUrl: prev?.currentAvatarThumbnailImageUrl || ''
				})
			);
			break;
		}
		case 'friend-location': {
			const userId = content.userId;
			const before = state.userCache.get(userId) || {};
			cacheUser(state, content.user || {});
			const next = state.userCache.get(userId);
			const newLoc = content.location;
			const prevLoc = before.location;
			const worldName = content.worldId ? await resolveWorldName(state, content.worldId) : '';
			if (newLoc && newLoc !== 'offline') {
				patchFriend(state.accountId, userId, {
					state: 'online',
					location: newLoc,
					worldName,
					displayName: next.displayName
				});
			}
			if (newLoc && newLoc !== 'offline' && prevLoc !== newLoc) {
				publishFeed(
					feedEntry(state, {
						type: 'GPS',
						userId,
						displayName: next.displayName,
						location: newLoc,
						previousLocation: prevLoc || '',
						worldId: content.worldId,
						worldName,
						userThumbnailUrl: next.currentAvatarThumbnailImageUrl || ''
					})
				);
			}
			break;
		}
		case 'friend-update': {
			const userId = content.userId;
			if (!userId || !content.user) break;
			const before = state.userCache.get(userId) || {};
			const after = {
				displayName: content.user.displayName,
				status: content.user.status,
				statusDescription: content.user.statusDescription,
				bio: content.user.bio,
				currentAvatarImageUrl: content.user.currentAvatarImageUrl,
				currentAvatarThumbnailImageUrl: content.user.currentAvatarThumbnailImageUrl,
				currentAvatar: content.user.currentAvatar,
				location: content.user.location ?? before.location ?? ''
			};
			state.userCache.set(userId, { ...before, ...after });

			if (
				before.currentAvatarImageUrl &&
				after.currentAvatarImageUrl &&
				before.currentAvatarImageUrl !== after.currentAvatarImageUrl
			) {
				publishFeed(
					feedEntry(state, {
						type: 'Avatar',
						userId,
						displayName: after.displayName || before.displayName,
						avatarName: content.user.currentAvatar || '',
						currentAvatarImageUrl: after.currentAvatarImageUrl,
						currentAvatarThumbnailImageUrl: after.currentAvatarThumbnailImageUrl,
						previousCurrentAvatarImageUrl: before.currentAvatarImageUrl,
						previousCurrentAvatarThumbnailImageUrl: before.currentAvatarThumbnailImageUrl,
						userThumbnailUrl: after.currentAvatarThumbnailImageUrl || ''
					})
				);
			} else if (before.status && after.status && before.status !== after.status) {
				publishFeed(
					feedEntry(state, {
						type: 'Status',
						userId,
						displayName: after.displayName || before.displayName,
						status: after.status,
						statusDescription: after.statusDescription,
						previousStatus: before.status,
						previousStatusDescription: before.statusDescription,
						userThumbnailUrl: after.currentAvatarThumbnailImageUrl || ''
					})
				);
			} else if (before.bio != null && after.bio != null && before.bio !== after.bio) {
				publishFeed(
					feedEntry(state, {
						type: 'Bio',
						userId,
						displayName: after.displayName || before.displayName,
						bio: after.bio,
						previousBio: before.bio,
						userThumbnailUrl: after.currentAvatarThumbnailImageUrl || ''
					})
				);
			}
			break;
		}
		case 'user-update': {
			if (content.user) {
				const sess = getSession(state.accountId);
				if (sess) setSession(state.accountId, { user: { ...(sess.user || {}), ...content.user } });
				// onlineFriends / activeFriends may have changed — reconcile
				reconcileStates(state.accountId, {
					activeFriends: content.user.activeFriends,
					onlineFriends: content.user.onlineFriends
				});
			}
			break;
		}
		case 'user-location': {
			const sess = getSession(state.accountId);
			if (!sess?.user) break;
			const loc = content.location;
			if (loc && loc !== 'offline') {
				const { worldId } = parseLocation(loc);
				const worldName = worldId ? await resolveWorldName(state, worldId) : '';
				publishFeed(
					feedEntry(state, {
						type: 'GPS',
						userId: sess.user.id,
						displayName: sess.user.displayName,
						location: loc,
						worldId,
						worldName,
						raw: { self: true }
					})
				);
			}
			break;
		}
		case 'notification-v2': {
			const n = content;
			const t = normalizeNotificationType(n.type);
			if (t === 'friendRequest' && n.senderUserId) {
				publishFeed(
					feedEntry(state, {
						type: 'FriendRequest',
						userId: n.senderUserId,
						displayName: n.senderDisplayName || n.senderUsername,
						raw: n
					})
				);
				addNotification({
					accountId: state.accountId,
					type: t,
					senderUserId: n.senderUserId,
					senderDisplayName: n.senderDisplayName,
					senderUsername: n.senderUsername,
					raw: n
				});
			} else if ((t === 'invite' || t === 'requestInvite') && n.senderUserId) {
				const worldId = n.details?.worldId || '';
				const worldName = worldId ? await resolveWorldName(state, worldId) : '';
				publishFeed(
					feedEntry(state, {
						type: 'Invite',
						userId: n.senderUserId,
						displayName: n.senderDisplayName || n.senderUsername,
						location: worldId ? `${worldId}:${n.details?.instanceId || ''}` : '',
						worldName,
						raw: n
					})
				);
				addNotification({
					accountId: state.accountId,
					type: t,
					senderUserId: n.senderUserId,
					senderDisplayName: n.senderDisplayName,
					senderUsername: n.senderUsername,
					worldId,
					worldName,
					instanceId: n.details?.instanceId || '',
					message: n.message || '',
					raw: n
				});
			} else if (t === 'message' || t === 'groupAnnouncement') {
				publishFeed(
					feedEntry(state, {
						type: 'Notification',
						userId: n.senderUserId,
						displayName: n.senderDisplayName || n.senderUsername,
						detail: n.message || t,
						raw: n
					})
				);
				addNotification({
					accountId: state.accountId,
					type: t,
					senderUserId: n.senderUserId,
					senderDisplayName: n.senderDisplayName,
					senderUsername: n.senderUsername,
					message: n.message || '',
					raw: n
				});
			}
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
			// Someone added us as a friend. content.user is the new friend.
			const u = content.user;
			if (!u?.id) break;
			cacheUser(state, u);
			upsertFriend(state.accountId, {
				id: u.id,
				displayName: u.displayName,
				currentAvatarThumbnailImageUrl: u.currentAvatarThumbnailImageUrl,
				status: u.status,
				state: 'offline',
				location: 'offline',
				platform: u.platform
			});
			publishFeed(
				feedEntry(state, {
					type: 'FriendRequest',
					userId: u.id,
					displayName: u.displayName || u.id,
					raw: { subtype: 'friend-add' }
				})
			);
			break;
		}
		case 'friend-delete': {
			// Someone removed us as a friend.
			const u = content.user;
			if (!u?.id) break;
			removeFriend(state.accountId, u.id);
			publishFeed(
				feedEntry(state, {
					type: 'Notification',
					userId: u.id,
					displayName: u.displayName || u.id,
					detail: 'Removed from friends',
					raw: { subtype: 'friend-delete' }
				})
			);
			break;
		}
		case 'notification-v2-delete': {
			// A notification was deleted (e.g. friend accepted invite).
			// We don't track notifications in DB yet, but we surface it.
			publishFeed(
				feedEntry(state, {
					type: 'Notification',
					detail: 'Notification dismissed',
					raw: content
				})
			);
			break;
		}
		case 'notification-v2-update': {
			// A notification updated (e.g. requestInvite → invite → accepted).
			const n = content.notification || content;
			if (n?.type === 'invite' || n?.type === 'requestInvite') {
				publishFeed(
					feedEntry(state, {
						type: 'Invite',
						userId: n.senderUserId,
						displayName: n.senderDisplayName || n.senderUsername,
						worldName: n.details?.worldId ? await resolveWorldName(state, n.details.worldId) : '',
						detail: n.message || '',
						raw: n
					})
				);
			} else if (n?.type === 'friendRequest') {
				publishFeed(
					feedEntry(state, {
						type: 'FriendRequest',
						userId: n.senderUserId,
						displayName: n.senderDisplayName || n.senderUsername,
						raw: n
					})
				);
			}
			break;
		}
		case 'notification': {
			// V1 notification API (older). content has type/id/nonce etc.
			const n = content;
			const detail = n.details || {};
			if (n.type === 'friendRequest') {
				publishFeed(
					feedEntry(state, {
						type: 'FriendRequest',
						userId: detail.senderUserId || n.senderUserId,
						displayName: detail.senderDisplayName || n.senderUsername,
						raw: n
					})
				);
			} else if (n.type === 'invite' || n.type === 'requestInvite' || n.type === 'message') {
				publishFeed(
					feedEntry(state, {
						type: 'Invite',
						userId: n.senderUserId,
						displayName: n.senderDisplayName || n.senderUsername,
						worldName: detail.worldId ? await resolveWorldName(state, detail.worldId) : '',
						detail: n.message || '',
						raw: n
					})
				);
			}
			break;
		}
		case 'group-joined': {
			const g = content.group;
			if (g?.id) {
				state.groupCache.set(g.id, g.name || g.id);
				publishFeed(
					feedEntry(state, {
						type: 'Group',
						detail: `Joined group ${g.name || g.id}`,
						groupName: g.name,
						raw: content
					})
				);
			}
			break;
		}
		case 'group-left': {
			const g = content.group;
			if (g?.id) state.groupCache.delete(g.id);
			publishFeed(
				feedEntry(state, {
					type: 'Group',
					detail: `Left group ${g?.name || g?.id || '?'}`,
					raw: content
				})
			);
			break;
		}
		case 'group-role-updated': {
			publishFeed(
				feedEntry(state, {
					type: 'Group',
					detail: 'Role updated in a group',
					raw: content
				})
			);
			break;
		}
		case 'group-member-updated': {
			// Don't spam — a friend got added/removed/role-changed in a group
			const u = content.user;
			if (u?.id) {
				publishFeed(
					feedEntry(state, {
						type: 'Group',
						userId: u.id,
						displayName: u.displayName,
						detail: 'Group membership changed',
						raw: content
					})
				);
			}
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
			// Periodic position update — only emit if position changes a lot
			// (VRC sends these often). For now, just log.
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
					detail: `Left instance queue`,
					raw: content
				})
			);
			break;
		}
		case 'content-refresh': {
			// VRC asks us to refresh worlds/avatars cache. Trigger async refresh.
			console.log(`[pipeline ${state.accountId}] content-refresh requested`);
			import('./worldCache.js').then((m) => m.warmMemoryCache(state.accountId)).catch(() => {});
			break;
		}
		default:
			break;
	}
}

/* --------------------- connection lifecycle --------------------- */

/**
 * @param {string} accountId
 */
export async function connectPipeline(accountId) {
	let state = states.get(accountId);
	if (!state) {
		state = newState(accountId);
		states.set(accountId, state);
	}
	if (state.ws && state.ws.readyState === WebSocket.OPEN) return;
	if (state.ws && state.ws.readyState === WebSocket.CONNECTING) return;

	let me;
	try {
		me = await getCurrentUser(accountId);
	} catch (err) {
		console.error(`[pipeline ${accountId}] getCurrentUser failed`, err.message);
		setSession(accountId, { lastError: `Auth check failed: ${err.message}` });
		bus.emit('accounts');
		return;
	}
	if (!me) {
		console.log(`[pipeline ${accountId}] not logged in, skip`);
		setSession(accountId, { lastError: 'Not logged in (cookie invalid)' });
		bus.emit('accounts');
		return;
	}
	setSession(accountId, { user: me, lastError: null });
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
		setSession(accountId, { lastError: `Pipeline token failed: ${err.message}` });
		bus.emit('accounts');
		return;
	}
	if (!token) {
		console.log(`[pipeline ${accountId}] no pipeline token`);
		setSession(accountId, { lastError: 'VRChat did not return a pipeline token' });
		bus.emit('accounts');
		return;
	}
	const url = `${getWebsocketUrl()}/?auth=${token}`;
	const ws = new WebSocket(url, { headers: { 'User-Agent': 'VRCActivity/0.1' } });
	state.ws = ws;

	ws.on('open', () => {
		state.connected = true;
		console.log(`[pipeline ${accountId}] connected`);
		// websocket ping every 30s + REST notification sync every ~90s (the
		// websocket can silently drop notification-v2 events; polling the
		// `notifications` endpoint is VRCX's belt-and-braces approach too).
		let tick = 0;
		state.refreshTimer = setInterval(() => {
			try {
				ws.ping();
			} catch {}
			tick++;
			if (tick % 3 === 0) {
				syncNotifications(state).catch(() => {});
			}
		}, 30000);
		// initial sync right after connecting
		syncNotifications(state).catch((err) =>
			console.error(`[pipeline ${accountId}] notification sync failed`, err.message)
		);
		bus.emit('accounts');
	});

	ws.on('unexpected-response', (_req, res) => {
		console.error(`[pipeline ${accountId}] unexpected-response ${res.statusCode}`);
		setSession(accountId, { lastError: `Pipeline handshake failed: HTTP ${res.statusCode}` });
		bus.emit('accounts');
	});

	ws.on('message', async (raw) => {
		const data = raw.toString();
		if (state.lastMessage === data) return;
		state.lastMessage = data;
		let msg = safeJsonParse(data);
		if (!msg) return;
		if (typeof msg.content === 'string') {
			const inner = safeJsonParse(msg.content);
			if (inner) msg.content = inner;
		}
		try {
			await handleMessage(state, msg);
		} catch (err) {
			console.error(`[pipeline ${accountId}] handler error`, err);
		}
	});

	ws.on('close', (code, reason) => {
		state.connected = false;
		if (state.refreshTimer) clearInterval(state.refreshTimer);
		state.refreshTimer = null;
		state.ws = null;
		console.log(`[pipeline ${accountId}] disconnected code=${code} reason=${reason}, scheduling reconnect`);
		scheduleReconnect(accountId);
		bus.emit('accounts');
	});

	ws.on('error', (err) => {
		console.error(`[pipeline ${accountId}] ws error`, err.message);
	});
}

function scheduleReconnect(accountId) {
	const state = states.get(accountId);
	if (!state) return;
	if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
	state.reconnectTimer = setTimeout(() => {
		connectPipeline(accountId).catch((err) => {
			console.error(`[pipeline ${accountId}] reconnect failed`, err.message);
			scheduleReconnect(accountId);
		});
	}, 5000);
}

export async function disconnectPipeline(accountId) {
	const state = states.get(accountId);
	if (!state) return;
	if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
	if (state.refreshTimer) clearInterval(state.refreshTimer);
	state.reconnectTimer = null;
	state.refreshTimer = null;
	const hadConnection = !!state.ws || state.connected;
	if (state.ws) {
		try {
			state.ws.close();
		} catch {}
		state.ws = null;
	}
	state.connected = false;
	if (hadConnection) bus.emit('accounts');
}

export function getPipelineState(accountId) {
	const state = states.get(accountId);
	return state ? { connected: state.connected } : { connected: false };
}

export function getAllPipelineStates() {
	const out = {};
	for (const [id, s] of states) out[id] = { connected: s.connected };
	for (const a of listAccounts()) {
		if (!out[a.id]) out[a.id] = { connected: false };
	}
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
