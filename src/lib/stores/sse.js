import { toasts } from './toast.js';
import { setInitial, pushEntry } from './feed.js';
import { accounts, accountsLoaded } from './accounts.js';
import { setFriendsSnapshot } from './friends.js';

let es = null;
let reconnectTimer = null;

/**
 * Connect to the SSE feed endpoint. Auto-reconnects on close.
 */
export function connectSSE() {
	if (es) return;
	es = new EventSource('/api/feed/events');

	es.addEventListener('hello', (e) => {
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
		} catch (err) {
			console.error('feed parse', err);
		}
	});

	es.addEventListener('accounts', (e) => {
		try {
			const data = JSON.parse(e.data);
			if (data.accounts) applyAccountState(data.accounts);
		} catch (err) {
			console.error('accounts parse', err);
		}
	});

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
			toasts.push('Connection lost, retrying…', 'error');
			reconnectTimer = setTimeout(connectSSE, 3000);
		}
	});

	// EventSource has a built-in auto-reconnect on transient drops, but
	// it doesn't emit a fresh event when it does — we still get a
	// subsequent 'hello' on the new socket. No extra work needed here.
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
