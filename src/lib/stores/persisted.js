import { writable } from 'svelte/store';

/**
 * A writable store mirrored to localStorage (per-browser UI preferences such
 * as list layout; server-side settings live in settings.js).
 * @template T
 * @param {string} key
 * @param {T} initial
 */
export function persisted(key, initial) {
	const storageKey = `vrcx-ng:${key}`;
	let start = initial;
	try {
		const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
		if (raw != null) start = JSON.parse(raw);
	} catch {}
	const store = writable(start);
	store.subscribe((v) => {
		try {
			if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(v));
		} catch {}
	});
	return store;
}
