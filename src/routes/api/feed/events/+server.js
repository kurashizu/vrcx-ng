import { bus, getBufferedFeed } from '$lib/server/bus.js';
import { getAllPipelineStates } from '$lib/server/pipeline.js';
import { aggregate } from '$lib/server/friends.js';

/**
 * Server-Sent Events stream.
 *   event: hello     -> { entries, accounts, friends, serverTime }
 *   event: feed      -> single FeedEntry
 *   event: accounts  -> { accounts }
 *   event: friends   -> aggregate()
 *   event: ping      -> keep-alive
 */
export async function GET({ request }) {
	const enc = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream({
		start(controller) {
			let closed = false;

			const send = (event, data) => {
				if (closed) return;
				try {
					controller.enqueue(enc.encode(`event: ${event}\n`));
					controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					closed = true;
				}
			};

			// initial snapshot
			send('hello', {
				entries: getBufferedFeed().slice(0, 200),
				accounts: getAllPipelineStates(),
				friends: aggregate(),
				serverTime: Date.now()
			});

			const onFeed = (entry) => send('feed', entry);
			const onAccounts = () => send('accounts', { accounts: getAllPipelineStates() });
			const onFriends = () => send('friends', aggregate());
			bus.on('feed', onFeed);
			bus.on('accounts', onAccounts);
			bus.on('friends', onFriends);

			const ping = setInterval(() => send('ping', { t: Date.now() }), 25000);

			const close = () => {
				if (closed) return;
				closed = true;
				clearInterval(ping);
				bus.off('feed', onFeed);
				bus.off('accounts', onAccounts);
				bus.off('friends', onFriends);
				try {
					controller.close();
				} catch {}
			};

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
