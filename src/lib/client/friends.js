import { describeLocation } from '$lib/shared/location.js';
import { shortId } from '$lib/shared/format.js';

/** @typedef {import('$lib/stores/friends.js').Friend} Friend */

export const byName = (/** @type {Friend} */ a, /** @type {Friend} */ b) =>
	String(a.displayName || '').localeCompare(String(b.displayName || ''));
export const byLastSeen = (/** @type {Friend} */ a, /** @type {Friend} */ b) => (b.lastSeen || 0) - (a.lastSeen || 0);

const STATUS_ORDER = { 'join me': 0, active: 1, 'ask me': 2, busy: 3 };

export const SORTS = {
	displayName: { label: '名字', cmp: byName },
	lastSeen: { label: '最后在线', cmp: (a, b) => (a.lastSeen || 0) - (b.lastSeen || 0) },
	platform: { label: '平台', cmp: (a, b) => String(a.platform || '').localeCompare(String(b.platform || '')) },
	status: { label: '状态', cmp: (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) }
};

/** @param {Friend[]} list @param {keyof typeof SORTS} by @param {'asc'|'desc'} dir */
export function sortFriends(list, by = 'displayName', dir = 'asc') {
	const cmp = (SORTS[by] || SORTS.displayName).cmp;
	const sign = dir === 'desc' ? -1 : 1;
	return [...list].sort((a, b) => cmp(a, b) * sign || byName(a, b));
}

/** Case-insensitive match on name / world / location / id. `q` must be lower-case. */
export function matchFriend(f, q) {
	if (!q) return true;
	return [f.displayName, f.worldName, f.location, f.id, f.statusDescription].some((s) => String(s || '').toLowerCase().includes(q));
}

/**
 * @typedef {{ key: string, location: string, count: number, friends: Friend[] }} InstanceBucket
 * @typedef {{ key: string, worldId: string, label: string, count: number, friends: Friend[], instances: InstanceBucket[] }} WorldBucket
 */

/**
 * Split in-game friends by where they are: per world (and per instance inside
 * it), plus those hiding their location and those travelling.
 * @param {Friend[]} list
 * @returns {{ worlds: WorldBucket[], incognito: Friend[], traveling: Friend[] }}
 */
export function groupByWorld(list) {
	const worlds = new Map();
	const incognito = [];
	const traveling = [];
	for (const f of list) {
		const d = describeLocation(f.location, f.worldName);
		if (d.kind === 'traveling') {
			traveling.push(f);
			continue;
		}
		if (d.kind !== 'instance') {
			incognito.push(f);
			continue;
		}
		let w = worlds.get(d.worldId);
		if (!w) worlds.set(d.worldId, (w = { key: d.worldId, worldId: d.worldId, label: shortId(d.worldId), named: false, count: 0, friends: [], instances: new Map() }));
		if (f.worldName && !w.named) {
			w.label = f.worldName;
			w.named = true;
		}
		w.count++;
		w.friends.push(f);
		let inst = w.instances.get(d.tag);
		if (!inst) w.instances.set(d.tag, (inst = { key: d.tag, location: d.tag, count: 0, friends: [] }));
		inst.count++;
		inst.friends.push(f);
	}
	const buckets = [...worlds.values()]
		.map(({ named, instances, ...w }) => ({ ...w, instances: [...instances.values()].sort((a, b) => b.count - a.count) }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
	return { worlds: buckets, incognito, traveling };
}

/**
 * Bucket friends by their local friend group (largest first, "未分组" last).
 * @param {Friend[]} list
 * @param {{ name: string, displayName: string, color?: string }[]} groups
 */
export function groupByFriendGroup(list, groups) {
	const buckets = new Map(groups.map((g) => [g.name, { key: g.name, label: g.displayName, color: g.color, friends: [] }]));
	const rest = [];
	for (const f of list) {
		const b = f.groupName && buckets.get(f.groupName);
		if (b) b.friends.push(f);
		else rest.push(f);
	}
	const out = [...buckets.values()].filter((b) => b.friends.length).sort((a, b) => b.friends.length - a.friends.length);
	if (rest.length) out.push({ key: '_none', label: '未分组', color: undefined, friends: rest });
	return out;
}

/** Friends standing in the same instance as one of our own accounts. */
export function inSameInstance(list, selfLocations) {
	const here = new Set((selfLocations || []).map((s) => s.location).filter((l) => l && l.startsWith('wrld_')));
	return here.size ? list.filter((f) => here.has(f.location)) : [];
}
