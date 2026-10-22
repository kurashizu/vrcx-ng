import { writable, get } from 'svelte/store';

/** user id → display name ('' = could not be read) for people who are not in any friend list (instance creators) */
export const userNames = writable(/** @type {Record<string, string>} */ ({}));
const asked = new Set();

/** Look the names up once (the server fetches the unknown ones in the background: ask again while `pending`). */
export async function ensureUserNames(ids, accountId = '') {
	const todo = [...new Set(ids)].filter((id) => /^usr_[0-9a-fA-F-]+$/.test(id) && get(userNames)[id] === undefined && !asked.has(id));
	if (!todo.length) return;
	todo.forEach((id) => asked.add(id));
	for (let i = 0; i < 8; i++) {
		try {
			const r = await fetch(`/api/user-names?ids=${todo.join(',')}&accountId=${encodeURIComponent(accountId)}`).then((x) => x.json());
			if (r.names && Object.keys(r.names).length) userNames.update((m) => ({ ...m, ...r.names }));
			if (!r.pending) return;
		} catch {
			break;
		}
		await new Promise((r) => setTimeout(r, 1500));
	}
	todo.forEach((id) => get(userNames)[id] === undefined && asked.delete(id));
}
