import { bus, getBufferedFeed } from '$lib/server/bus.js';
import { getAllPipelineStates } from '$lib/server/pipeline.js';
import { aggregate } from '$lib/server/friends.js';
import { getSetting } from '$lib/server/settings.js';

/** `friends` snapshots are large; send at most one per interval (latest wins). */
const FRIENDS_THROTTLE_MS = 2000;

/**
 * Server-Sent Events stream.
 *   event: hello     -> { entries, accounts, friends, serverTime }
 *   event: feed      -> single FeedEntry
 *   event: accounts  -> { accounts }
 *   event: friends   -> aggregate()   (throttled)
 *   event: notifications -> { t }     (the inbox changed; clients refetch)
 *   event: ping      -> keep-alive
 */
export async function GET({ request }) {
	const enc = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream({
		start(controller) {
			let closed = false;
			let friendsTimer = null;
			let lastFriendsAt = 0;

			const send = (event, data) => {
				if (closed) return;
				try {
					controller.enqueue(enc.encode(`event: ${event}\n`));
					controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// the client is gone — tear everything down (listeners, timers)
					close();
				}
			};

			// initial snapshot
			const helloEntries = Math.min(Math.max(Number(getSetting('feed.maxEntries')) || 500, 100), 1000);
			send('hello', {
				entries: getBufferedFeed().slice(0, helloEntries),
				accounts: getAllPipelineStates(),
				friends: aggregate(),
				serverTime: Date.now()
			});

			const onFeed = (entry) => send('feed', entry);
			const onAccounts = () => send('accounts', { accounts: getAllPipelineStates() });
			const onFriends = () => {
				if (closed || friendsTimer) return;
				const wait = Math.max(0, lastFriendsAt + FRIENDS_THROTTLE_MS - Date.now());
				friendsTimer = setTimeout(() => {
					friendsTimer = null;
					lastFriendsAt = Date.now();
					send('friends', aggregate());
				}, wait);
			};
			const onNotifications = () => send('notifications', { t: Date.now() });
			const onShutdown = () => close();
			bus.on('shutdown', onShutdown);
			bus.on('feed', onFeed);
			bus.on('accounts', onAccounts);
			bus.on('friends', onFriends);
			bus.on('notifications', onNotifications);

			const ping = setInterval(() => send('ping', { t: Date.now() }), 25000);

			function close() {
				if (closed) return;
				closed = true;
				clearInterval(ping);
				if (friendsTimer) clearTimeout(friendsTimer);
				bus.off('feed', onFeed);
				bus.off('accounts', onAccounts);
				bus.off('friends', onFriends);
				bus.off('notifications', onNotifications);
				bus.off('shutdown', onShutdown);
				try {
					controller.close();
				} catch {}
			}

			cleanup = close;
			request.signal.addEventListener('abort', close);
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no',
			Connection: 'keep-alive'
		}
	});
}
