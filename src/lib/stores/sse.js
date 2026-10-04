import { get } from 'svelte/store';
import { toasts } from './toast.js';
import { setInitial, pushEntry } from './feed.js';
import { accounts, accountsLoaded, refreshAccounts } from './accounts.js';
import { setFriendsSnapshot } from './friends.js';
import { settings } from './settings.js';
import { notificationsTick } from './notifications.js';

let es = null;
let reconnectTimer = null;
let outage = false; // a "connection lost" toast is already showing
let retryDelay = 3000;
let accountsTimer = null;

/** Connect to the SSE endpoint (reconnects on its own). */
export function connectSSE() {
	if (es) return;
	es = new EventSource('/api/feed/events');

	/** JSON-parse an event and hand it to `fn`; a bad payload is logged, not fatal. */
	const on = (name, fn) =>
		es.addEventListener(name, (e) => {
			try {
				fn(JSON.parse(/** @type {MessageEvent} */ (e).data));
			} catch (err) {
				console.error(`sse ${name}`, err);
			}
		});

	on('hello', (data) => {
		retryDelay = 3000;
		if (outage) {
			outage = false;
			toasts.success('已重新连接');
		}
		setInitial(data.entries || []);
		if (data.accounts) applyConnectionState(data.accounts);
		if (data.friends) setFriendsSnapshot(data.friends);
	});

	on('feed', (entry) => {
		pushEntry(entry);
		desktopNotify(entry);
	});

	on('accounts', (data) => {
		if (data.accounts) applyConnectionState(data.accounts);
		// the SSE payload only carries {connected}; re-read the list so the
		// sidebar picks up each account's current location / status too
		scheduleAccountsRefresh();
	});

	on('friends', setFriendsSnapshot);
	es.addEventListener('notifications', () => notificationsTick.update((n) => n + 1));

	es.addEventListener('error', () => {
		// EventSource retries transient drops by itself; only a permanent close needs us
		if (es?.readyState !== EventSource.CLOSED) return;
		es = null;
		if (!outage) {
			outage = true;
			toasts.error('连接已断开，正在重试…');
		}
		reconnectTimer = setTimeout(connectSSE, retryDelay);
		retryDelay = Math.min(retryDelay * 2, 30000);
	});
}

export function disconnectSSE() {
	clearTimeout(reconnectTimer);
	reconnectTimer = null;
	es?.close();
	es = null;
}

function scheduleAccountsRefresh() {
	if (accountsTimer) return;
	accountsTimer = setTimeout(() => {
		accountsTimer = null;
		refreshAccounts().catch((err) => console.error('accounts refresh', err));
	}, 800);
}

function applyConnectionState(stateMap) {
	accounts.update((arr) => arr.map((a) => (stateMap[a.id] ? { ...a, connected: !!stateMap[a.id].connected } : a)));
	accountsLoaded.set(true);
}

/**
 * Browser notification for an incoming entry, per the "通知" settings. Only for
 * a tab nobody is looking at, and only where the browser offers the
 * Notification API (https or localhost — not plain http on the LAN).
 */
function desktopNotify(entry) {
	try {
		if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
		if (document.visibilityState === 'visible') return;
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
