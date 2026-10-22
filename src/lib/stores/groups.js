import { writable, get } from 'svelte/store';

/** group id → { name, shortCode, discriminator, iconUrl, memberCount } (an empty name: the group cannot be read) */
export const groupInfo = writable(/** @type {Record<string, any>} */ ({}));
const asked = new Set();

/** Look the groups up once (the server caches them and fetches the missing ones in the background: ask again while `pending`). */
export async function ensureGroups(ids, accountId = '') {
	const todo = [...new Set(ids)].filter((id) => /^grp_[0-9a-fA-F-]+$/.test(id) && !get(groupInfo)[id] && !asked.has(id));
	if (!todo.length) return;
	todo.forEach((id) => asked.add(id));
	for (let i = 0; i < 8; i++) {
		try {
			const r = await fetch(`/api/groups?ids=${todo.join(',')}&accountId=${encodeURIComponent(accountId)}`).then((x) => x.json());
			if (r.groups && Object.keys(r.groups).length) groupInfo.update((m) => ({ ...m, ...r.groups }));
			if (!r.pending) return;
		} catch {
			break;
		}
		await new Promise((r) => setTimeout(r, 1500));
	}
	// not resolved: let a later view ask again
	todo.forEach((id) => !get(groupInfo)[id] && asked.delete(id));
}
