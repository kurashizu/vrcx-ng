import { writable } from 'svelte/store';

function createToasts() {
	const { subscribe, update } = writable(/** @type {{ id: number, kind: string, message: string }[]} */ ([]));
	let nextId = 1;

	/** @param {string} message @param {'info'|'success'|'error'} [kind] @param {number} [ms] */
	function push(message, kind = 'info', ms = 4000) {
		const id = nextId++;
		update((arr) => [...arr, { id, kind, message }]);
		setTimeout(() => update((arr) => arr.filter((t) => t.id !== id)), ms);
	}

	return {
		subscribe,
		push,
		success: (/** @type {string} */ m) => push(m, 'success'),
		error: (/** @type {string} */ m) => push(m, 'error', 6000)
	};
}

export const toasts = createToasts();
