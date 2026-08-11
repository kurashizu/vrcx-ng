import { getDb } from './db.js';
import { getWorld } from './vrchat.js';

/**
 * World cache: world_id -> { name, thumbnail, ... }.
 * Populated lazily by pipeline events (friend-online, friend-location).
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** @type {Map<string, { worldId: string, name: string, thumbnailUrl: string|null, authorName: string|null, occupants: number|null }>} */
const memCache = new Map();

/**
 * Invalidate memory cache for a specific world (e.g. when we just wrote fresh
 * data to the DB and want subsequent reads to see it).
 */
export function invalidateMem(worldId) {
	memCache.delete(worldId);
}

/**
 * Get world metadata from cache. Returns the in-memory cached record if fresh,
 * otherwise looks up DB. If still not found and `fetchOnMiss` is true, calls the
 * VRChat API and persists.
 * @param {string} accountId
 * @param {string} worldId
 * @param {{ fetchOnMiss?: boolean }} [opts]
 * @returns {Promise<{ worldId: string, name: string, thumbnailUrl: string|null, authorName: string|null, occupants: number|null } | null>}
 */
export async function getWorldMeta(accountId, worldId, { fetchOnMiss = true } = {}) {
	if (!worldId) return null;

	// L1: in-memory
	const mem = memCache.get(worldId);
	if (mem) return mem;

	// L2: sqlite
	const row = getDb()
		.prepare('SELECT name, thumbnail_url, author_name, occupants, updated_at FROM world_cache WHERE world_id = ?')
		.get(worldId);
	if (row && Date.now() - row.updated_at < TTL_MS) {
		let imageUrl = null;
		if (row.raw_json) {
			try { imageUrl = JSON.parse(row.raw_json).imageUrl || null; } catch {}
		}
		const rec = {
			worldId,
			name: row.name,
			imageUrl,
			thumbnailUrl: row.thumbnail_url || null,
			authorName: row.author_name || null,
			occupants: row.occupants ?? null
		};
		memCache.set(worldId, rec);
		return rec;
	}

	// L3: API
	if (!fetchOnMiss) return null;
	try {
		const w = await getWorld(accountId, worldId);
		if (!w) return null;
		const rec = {
			worldId,
			name: w.name || worldId,
			imageUrl: w.imageUrl || w.thumbnailImageUrl || null,
			thumbnailUrl: w.thumbnailImageUrl || null,
			authorName: w.authorName || null,
			occupants: typeof w.occupants === 'number' ? w.occupants : null
		};
		persist(rec, w);
		memCache.set(worldId, rec);
		return rec;
	} catch {
		return null;
	}
}

/**
 * Just get the name (cheap path used by pipeline). Falls back to ID.
 */
export async function getWorldName(accountId, worldId) {
	const meta = await getWorldMeta(accountId, worldId, { fetchOnMiss: true });
	return meta?.name || worldId;
}

function persist(rec, rawJson) {
	getDb()
		.prepare(
			`INSERT INTO world_cache (world_id, name, thumbnail_url, author_id, author_name, occupants, raw_json, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(world_id) DO UPDATE SET
			   name = excluded.name,
			   thumbnail_url = excluded.thumbnail_url,
			   author_id = excluded.author_id,
			   author_name = excluded.author_name,
			   occupants = excluded.occupants,
			   raw_json = excluded.raw_json,
			   updated_at = excluded.updated_at`
		)
		.run(
			rec.worldId,
			rec.name,
			rec.thumbnailUrl || null,
			rawJson?.authorId || null,
			rec.authorName || null,
			rec.occupants ?? null,
			JSON.stringify(rawJson || {}),
			Date.now()
		);
}

/**
 * Preload cached worlds into memory at startup.
 */
export function warmMemoryCache() {
	const rows = getDb()
		.prepare('SELECT world_id, name, thumbnail_url, author_name, occupants, updated_at FROM world_cache')
		.all();
	const now = Date.now();
	for (const r of rows) {
		if (now - r.updated_at >= TTL_MS) continue;
		memCache.set(r.world_id, {
			worldId: r.world_id,
			name: r.name,
			thumbnailUrl: r.thumbnail_url || null,
			authorName: r.author_name || null,
			occupants: r.occupants ?? null
		});
	}
}

/**
 * Lookup world names for many IDs in one shot (only what's cached, no API).
 * @param {string[]} worldIds
 * @returns {Record<string, string>}
 */
export function bulkLookup(worldIds) {
	if (!worldIds?.length) return {};
	const placeholders = worldIds.map(() => '?').join(',');
	const rows = getDb()
		.prepare(`SELECT world_id, name FROM world_cache WHERE world_id IN (${placeholders})`)
		.all(...worldIds);
	const out = {};
	for (const r of rows) out[r.world_id] = r.name;
	// backfill in-memory
	for (const [wid, name] of Object.entries(out)) {
		if (!memCache.has(wid)) {
			memCache.set(wid, {
				worldId: wid,
				name,
				thumbnailUrl: null,
				authorName: null,
				occupants: null
			});
		}
	}
	return out;
}
