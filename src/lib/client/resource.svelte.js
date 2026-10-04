/**
 * Reactive async loader with stale-response protection: only the most recent
 * `load()` call may write its result. Used by the detail dialogs.
 *
 * @template T
 * @param {(...args: any[]) => Promise<T>} fetcher
 */
export function createResource(fetcher) {
	let data = $state(/** @type {T | null} */ (null));
	let loading = $state(false);
	let error = $state('');
	let seq = 0;

	async function load(...args) {
		const mine = ++seq;
		loading = true;
		error = '';
		try {
			const result = await fetcher(...args);
			if (mine === seq) data = result;
		} catch (err) {
			if (mine === seq) {
				error = err?.message || String(err);
				data = null;
			}
		} finally {
			if (mine === seq) loading = false;
		}
	}

	function reset() {
		seq++;
		data = null;
		loading = false;
		error = '';
	}

	return {
		get data() {
			return data;
		},
		set data(v) {
			data = v;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		load,
		reset
	};
}
