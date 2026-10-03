import { writable, get } from 'svelte/store';
import { toasts } from './toast.js';
import { setInitial, pushEntry } from './feed.js';
import { accounts, accountsLoaded, refreshAccounts } from './accounts.js';
import { setFriendsSnapshot } from './friends.js';
import { settings } from './settings.js';

/** Bumped whenever the server reports a notification change (new / seen / dismissed). */
export const notificationsTick = writable(0);

let es = null;
let reconnectTimer = null;
let outage = false; // a "connection lost" toast is already showing for this outage
let retryDelay = 3000;

/**
 * Connect to the SSE feed endpoint. Auto-reconnects on close.
 */
export function connectSSE() {
	if (es) return;
	es = new EventSource('/api/feed/events');

	es.addEventListener('hello', (e) => {
		retryDelay = 3000;
		if (outage) {
			outage = false;
			toasts.push('已重新连接', 'success');
		}
		try {
			const data = JSON.parse(e.data);
			setInitial(data.entries || []);
			if (data.accounts) applyAccountState(data.accounts);
			if (data.friends) setFriendsSnapshot(data.friends);
		} catch (err) {
			console.error('hello parse', err);
		}
	});

	es.addEventListener('feed', (e) => {
		try {
			const entry = JSON.parse(e.data);
			pushEntry(entry);
			desktopNotify(entry);
		} catch (err) {
			console.error('feed parse', err);
		}
	});

	es.addEventListener('accounts', (e) => {
		try {
			const data = JSON.parse(e.data);
			if (data.accounts) applyAccountState(data.accounts);
			// The SSE accounts payload only carries {connected}; refresh the
			// full account list so the bar picks up currentUser.location
			// (and other session-derived fields) after a user-location event.
			scheduleAccountsRefresh();
		} catch (err) {
			console.error('accounts parse', err);
		}
	});

	es.addEventListener('notifications', () => notificationsTick.update((n) => n + 1));

	es.addEventListener('friends', (e) => {
		try {
			const data = JSON.parse(e.data);
			setFriendsSnapshot(data);
		} catch (err) {
			console.error('friends parse', err);
		}
	});

	es.addEventListener('error', () => {
		// EventSource auto-reconnects, but if it permanently closes (readyState CLOSED), we fall back
		if (es?.readyState === EventSource.CLOSED) {
			es = null;
			if (!outage) {
				outage = true;
				toasts.push('连接已断开，正在重试…', 'error');
			}
			reconnectTimer = setTimeout(connectSSE, retryDelay);
			retryDelay = Math.min(retryDelay * 2, 30000);
		}
	});

	// EventSource has a built-in auto-reconnect on transient drops, but
	// it doesn't emit a fresh event when it does — we still get a
	// subsequent 'hello' on the new socket. No extra work needed here.
}

/**
 * Browser notification for an incoming feed entry, per the "通知" settings.
 * Only for a tab the user isn't looking at, and only where the browser allows
 * the Notification API (https or localhost — not plain http on the LAN).
 */
function desktopNotify(entry) {
	try {
		if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
		if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
		const s = get(settings);
		if (!s['notification.desktop']) return;
		const who = entry.displayName || entry.userId || '';
		let title = '';
		let body = '';
		if (entry.type === 'Invite' && s['notification.invite']) {
			title = `${who} 发来邀请`;
			body = entry.worldName || entry.detail || '';
		} else if (entry.type === 'FriendRequest' && s['notification.friendRequest']) {
			title = `${who} 发来好友请求`;
		} else if (entry.type === 'Online' && s['notification.friendOnline']) {
			title = `${who} 上线了`;
			body = entry.worldName || '';
		} else {
			return;
		}
		new Notification(title, { body, tag: entry.id });
	} catch {}
}

let accountsRefreshTimer = null;
function scheduleAccountsRefresh() {
	if (accountsRefreshTimer) return;
	accountsRefreshTimer = setTimeout(() => {
		accountsRefreshTimer = null;
		refreshAccounts().catch((err) => console.error('accounts refresh', err));
	}, 800);
}

function applyAccountState(stateMap) {
	accounts.update((arr) =>
		arr.map((a) => {
			const s = stateMap[a.id];
			return s ? { ...a, connected: !!s.connected } : a;
		})
	);
	accountsLoaded.set(true);
}

export function disconnectSSE() {
	if (reconnectTimer) clearTimeout(reconnectTimer);
	reconnectTimer = null;
	if (es) {
		es.close();
		es = null;
	}
}
