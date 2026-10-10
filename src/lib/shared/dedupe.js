/**
 * The same friend event is reported once per account that is friends with
 * that user (your own accounts are often friends of each other, and several
 * accounts share friends). The feed shows it once, with every account that saw it.
 */

/** Events that describe the *user*, so every account reports the same thing. */
const USER_EVENTS = new Set(['Online', 'Offline', 'Active', 'GPS', 'Status', 'Avatar', 'Bio', 'DisplayName', 'TrustLevel']);

/** Reports of one event arrive within seconds of each other (Offline is held back 170 s by each account alike). */
export const MERGE_WINDOW_MS = 120_000;

/**
 * Identity of an event apart from which account saw it, or null when the
 * entry is account-specific (invites, friend requests, notifications…) and
 * must never be merged.
 * @param {any} e
 * @returns {string|null}
 */
export function eventKey(e) {
	if (!e?.userId || !USER_EVENTS.has(e.type)) return null;
	let sig = '';
	switch (e.type) {
		case 'GPS':
		case 'Online':
			sig = e.location || '';
			break;
		case 'Status':
			sig = `${e.status || ''}|${e.statusDescription || ''}`;
			break;
		case 'Avatar':
			sig = e.currentAvatarImageUrl || e.avatarName || '';
			break;
		case 'Bio':
			sig = e.bio || '';
			break;
		case 'DisplayName':
			sig = `${e.previousDisplayName || ''}>${e.displayName || ''}`;
			break;
		case 'TrustLevel':
			sig = e.trustLevel || '';
			break;
	}
	return `${e.type}\u0000${e.userId}\u0000${sig}`;
}

/**
 * Collapse duplicates in a newest-first list. The surviving entry (the newest
 * report) gets `accounts: string[]` — every account id that reported it.
 * @template {{ id: string, accountId: string, created_at: string }} T
 * @param {T[]} entries
 * @returns {(T & { accounts: string[] })[]}
 */
export function mergeDuplicates(entries) {
	/** @type {Map<string, any>} */
	const heads = new Map();
	const out = [];
	for (const e of entries) {
		const key = eventKey(e);
		const head = key && heads.get(key);
		if (head && !head.accounts.includes(e.accountId) && Math.abs(Date.parse(head.created_at) - Date.parse(e.created_at)) <= MERGE_WINDOW_MS) {
			head.accounts.push(e.accountId);
			continue;
		}
		const copy = { ...e, accounts: [e.accountId] };
		if (key) heads.set(key, copy);
		out.push(copy);
	}
	return out;
}
