import { writable } from 'svelte/store';

function createToasts() {
	const { subscribe, update } = writable(/** @type {{id:number,kind:string,message:string}[]} */ ([]));
	let nextId = 1;
	return {
		subscribe,
		/** @param {string} message */
		push(message, kind = 'info') {
			const id = nextId++;
			update((arr) => [...arr, { id, kind, message }]);
			setTimeout(() => {
				update((arr) => arr.filter((t) => t.id !== id));
			}, 4000);
		},
		error(message) {
			this.push(message, 'error');
		},
		success(message) {
			this.push(message, 'success');
		}
	};
}

export const toasts = createToasts();
