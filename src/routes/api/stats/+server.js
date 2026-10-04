import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Activity statistics computed from the persisted feed.
 *   GET /api/stats?days=1|7|30|90
 *
 *  - topOnline : friends by total time online (sum of Offline entries' `time`)
 *  - hourly    : how many friends came online in each UTC hour (the page shifts it to local time)
 *  - topWorlds : worlds ranked by how many different friends went there (then by visits; one friend
 *                hopping in and out of the same world must not dominate)
 *  - totals    : entries per type
 *  - since     : when the recorded history starts (it only grows from the day the feed was persisted)
 */
export async function GET({ url }) {
	const asked = Number(url.searchParams.get('days'));
	const days = [1, 7, 30, 90].includes(asked) ? asked : 7;
	const since = Date.now() - days * DAY_MS;
	const db = getDb();

	const topOnline = db
		.prepare(
			`SELECT user_id AS userId, MAX(display_name) AS displayName,
			        COUNT(*) AS sessions,
			        SUM(CAST(json_extract(raw_json, '$.time') AS INTEGER)) AS totalMs
			   FROM feed_events
			  WHERE type = 'Offline' AND created_at >= ? AND json_valid(raw_json)
			    AND json_extract(raw_json, '$.time') IS NOT NULL
			  GROUP BY user_id
			  ORDER BY totalMs DESC
			  LIMIT 20`
		)
		.all(since);

	const hourlyRows = db
		.prepare(
			`SELECT CAST(strftime('%H', created_at / 1000, 'unixepoch') AS INTEGER) AS h, COUNT(*) AS c
			   FROM feed_events WHERE type = 'Online' AND created_at >= ? GROUP BY h`
		)
		.all(since);
	const hourly = Array.from({ length: 24 }, () => 0);
	for (const r of hourlyRows) hourly[r.h] = r.c;

	const topWorlds = db
		.prepare(
			`SELECT world_id AS worldId, MAX(world_name) AS worldName,
			        COUNT(*) AS visits, COUNT(DISTINCT user_id) AS people
			   FROM feed_events
			  WHERE type = 'GPS' AND created_at >= ? AND world_id IS NOT NULL AND world_id != ''
			  GROUP BY world_id
			  ORDER BY people DESC, visits DESC
			  LIMIT 20`
		)
		.all(since);

	const totals = Object.fromEntries(
		db
			.prepare('SELECT type, COUNT(*) AS c FROM feed_events WHERE created_at >= ? GROUP BY type ORDER BY c DESC')
			.all(since)
			.map((r) => [r.type, r.c])
	);
	const first = db.prepare('SELECT MIN(created_at) AS t FROM feed_events').get()?.t || null;

	return json({ days, since: first, topOnline, hourly, topWorlds, totals });
}
