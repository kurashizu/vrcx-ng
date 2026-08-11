import { EventEmitter } from 'node:events';

/**
 * Server-side event bus. SSE endpoints subscribe to `feed` events and forward
 * them to all connected clients.
 */
class Bus extends EventEmitter {
	constructor() {
		super();
		this.setMaxListeners(0);
	}
}

export const bus = new Bus();

/** @type {import('./feed.js').FeedEntry[]} */
const feedBuffer = [];
const MAX_BUFFER = 2000;

/**
 * Push a feed entry to all SSE subscribers and buffer it for late joiners.
 * @param {import('../shared/feed.js').FeedEntry} entry
 */
export function publishFeed(entry) {
	if (!entry?.id) entry.id = crypto.randomUUID();
	if (!entry.created_at) entry.created_at = new Date().toISOString();
	feedBuffer.unshift(entry);
	if (feedBuffer.length > MAX_BUFFER) feedBuffer.length = MAX_BUFFER;
	bus.emit('feed', entry);
}

export function getBufferedFeed() {
	return feedBuffer.slice();
}

/**
 * Replace bare usr_xxx display names in already-buffered feed entries once
 * the real name is learned (via friend sync or a later event).
 * @param {string} userId
 * @param {string} displayName
 */
export function backfillFeedNames(userId, displayName) {
	if (!userId || !displayName || userId === displayName) return;
	for (const e of feedBuffer) {
		if (e.userId === userId && (!e.displayName || e.displayName === userId)) {
			e.displayName = displayName;
		}
	}
}
