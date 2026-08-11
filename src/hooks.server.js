import { bootstrapAll } from '$lib/server/pipeline.js';
import { loadFriends } from '$lib/server/friends.js';

let bootstrapped = false;

export async function init() {
	if (bootstrapped) return;
	bootstrapped = true;
	setTimeout(async () => {
		try {
			await bootstrapAll();
			// After pipelines connect, pull friend lists for each account
			const { listSessions, listAccounts } = await import('$lib/server/accounts.js');
			for (const acc of listAccounts()) {
				const sess = listSessions()[acc.id];
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
