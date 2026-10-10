import { readable } from 'svelte/store';

/** Current time, refreshed every 20 s — lets "5 min ago" labels tick. */
export const now = readable(Date.now(), (set) => {
	const id = setInterval(() => set(Date.now()), 20000);
	return () => clearInterval(id);
});
