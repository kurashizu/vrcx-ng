import { getDb } from './db.js';
import { getWorld } from './vrchat.js';

/**
 * World cache: world_id -> { name, thumbnail, ... }.
 * Populated lazily by pipeline events (friend-online, friend-location).
 *
 *   L1  in-memory map (MEM_TTL_MS)
 *   L2  sqlite `world_cache` (TTL_MS)
 *   L3  VRChat API (single-flight per world, failures are negative-cached)
 *
 * Only real world ids (`wrld_…`) are ever looked up; sentinels such as
 * 'private' / 'traveling' / 'offline' return null without touching the API.
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24h: after this the row is refetched
const MEM_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000; // don't retry a failing world for 10 min

/** @typedef {{ worldId: string, name: string, imageUrl: string|null, thumbnailUrl: string|null, authorId: string|null, authorName: string|null, occupants: number|null }} WorldMeta */

/** @type {Map<string, WorldMeta & { fetchedAt: number }>} */
const memCache = new Map();
/** worldId -> time until which a failed fetch is not retried */
const negativeCache = new Map();
/** @type {Map<string, Promise<WorldMeta|null>>} */
const inflight = new Map();

const isWorldId = (id) => typeof id === 'string' && id.startsWith('wrld_');

const SELECT_COLS = `name, thumbnail_url, author_id, author_name, occupants, updated_at,
	CASE WHEN json_valid(raw_json) THEN json_extract(raw_json, '$.imageUrl') END AS image_url`;

function rowToMeta(worldId, row) {
	return {
		worldId,
		name: row.name,
		imageUrl: row.image_url || row.thumbnail_url || null,
		thumbnailUrl: row.thumbnail_url || null,
		authorId: row.author_id || null,
		authorName: row.author_name || null,
		occupants: row.occupants ?? null
	};
}

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
 * VRChat API and persists. When the API fails the stale DB row (if any) is
 * returned instead of nothing.
 * @param {string} accountId
 * @param {string} worldId
 * @param {{ fetchOnMiss?: boolean }} [opts]
 * @returns {Promise<WorldMeta | null>}
 */
export async function getWorldMeta(accountId, worldId, { fetchOnMiss = true } = {}) {
	if (!isWorldId(worldId)) return null;
	const now = Date.now();

	// L1: in-memory
	const mem = memCache.get(worldId);
	if (mem && now - mem.fetchedAt < MEM_TTL_MS) return mem;

	// L2: sqlite
	const row = getDb()
		.prepare(`SELECT ${SELECT_COLS} FROM world_cache WHERE world_id = ?`)
		.get(worldId);
	if (row && now - row.updated_at < TTL_MS) {
		const rec = { ...rowToMeta(worldId, row), fetchedAt: row.updated_at };
		memCache.set(worldId, rec);
		return rec;
	}

	const stale = row ? rowToMeta(worldId, row) : null;

	// L3: API
	if (!fetchOnMiss) return stale;
	if ((negativeCache.get(worldId) || 0) > now) return stale;

	let p = inflight.get(worldId);
	if (!p) {
		p = fetchWorld(accountId, worldId).finally(() => inflight.delete(worldId));
		inflight.set(worldId, p);
	}
	return (await p) || stale;
}

async function fetchWorld(accountId, worldId) {
	try {
		const w = await getWorld(accountId, worldId);
		if (!w) {
			negativeCache.set(worldId, Date.now() + NEGATIVE_TTL_MS);
			return null;
		}
		const rec = {
			worldId,
			name: w.name || worldId,
			imageUrl: w.imageUrl || w.thumbnailImageUrl || null,
			thumbnailUrl: w.thumbnailImageUrl || null,
			authorId: w.authorId || null,
			authorName: w.authorName || null,
			occupants: typeof w.occupants === 'number' ? w.occupants : null
		};
		persist(rec);
		negativeCache.delete(worldId);
		memCache.set(worldId, { ...rec, fetchedAt: Date.now() });
		return rec;
	} catch {
		negativeCache.set(worldId, Date.now() + NEGATIVE_TTL_MS);
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

function persist(rec) {
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
			rec.authorId || null,
			rec.authorName || null,
			rec.occupants ?? null,
			// only the fields we read back — the full world payload is not kept
			JSON.stringify({ imageUrl: rec.imageUrl || null }),
			Date.now()
		);
}

/**
 * Preload cached worlds into memory at startup.
 */
export function warmMemoryCache() {
	const rows = getDb().prepare(`SELECT world_id, ${SELECT_COLS} FROM world_cache`).all();
	const now = Date.now();
	for (const r of rows) {
		if (now - r.updated_at >= TTL_MS) continue;
		memCache.set(r.world_id, { ...rowToMeta(r.world_id, r), fetchedAt: r.updated_at });
	}
}

/**
 * Lookup world names for many IDs in one shot (only what's cached, no API).
 * @param {string[]} worldIds
 * @returns {Record<string, string>}
 */
export function bulkLookup(worldIds) {
	const ids = [...new Set((worldIds || []).filter(isWorldId))];
	if (!ids.length) return {};
	const placeholders = ids.map(() => '?').join(',');
	const rows = getDb()
		.prepare(`SELECT world_id, name FROM world_cache WHERE world_id IN (${placeholders})`)
		.all(...ids);
	const out = {};
	for (const r of rows) out[r.world_id] = r.name;
	return out;
}
