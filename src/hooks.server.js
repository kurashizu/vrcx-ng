import { bootstrapAll, disconnectPipeline } from '$lib/server/pipeline.js';
import { loadFriends } from '$lib/server/friends.js';
import { listAccounts, listSessions } from '$lib/server/accounts.js';
import { bus } from '$lib/server/bus.js';

let bootstrapped = false;

/**
 * adapter-node only starts closing once all HTTP connections have ended (SSE
 * streams never do) and it never calls process.exit() itself — the open
 * pipeline sockets keep the event loop alive. Left alone a restart hangs until
 * systemd SIGKILLs the service (90 s). So on SIGTERM / SIGINT: end the SSE
 * streams, close the pipelines, and exit.
 */
let shuttingDown = false;
function fastShutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	try {
		bus.emit('shutdown');
		for (const a of listAccounts()) disconnectPipeline(a.id);
	} catch (err) {
		console.error('shutdown cleanup failed', err);
	}
	setTimeout(() => process.exit(0), 1500);
}

export async function init() {
	if (bootstrapped) return;
	bootstrapped = true;
	process.once('SIGTERM', fastShutdown);
	process.once('SIGINT', fastShutdown);
	setTimeout(async () => {
		try {
			await bootstrapAll();
			// After pipelines connect, pull friend lists for each account
			const sessions = listSessions();
			for (const acc of listAccounts()) {
				const sess = sessions[acc.id];
				if (sess?.cookie) {
					loadFriends(acc.id).catch((err) =>
						console.error(`friends initial load failed for ${acc.id}`, err.message)
					);
				}
			}
		} catch (err) {
			console.error('bootstrap error', err);
		}
	}, 1000);
}
