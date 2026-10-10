import { toasts } from '$lib/stores/toast.js';

/**
 * fetch + JSON with one error contract: anything but a 2xx (or an explicit
 * `{ ok: false }` body) throws an Error carrying the server's message.
 *
 * @param {string} path
 * @param {{ method?: string, body?: any, query?: Record<string, any> }} [opts]
 */
export async function api(path, { method = 'GET', body, query } = {}) {
	let url = path;
	if (query) {
		const q = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) if (v != null && v !== '') q.set(k, String(v));
		const s = q.toString();
		if (s) url += (url.includes('?') ? '&' : '?') + s;
	}
	const hasBody = body !== undefined;
	const res = await fetch(url, {
		method,
		headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
		body: hasBody ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
	return data;
}

/**
 * Run an action and report the outcome as a toast. Resolves to the result
 * (always truthy) on success and `undefined` on failure — never throws.
 *
 * @template T
 * @param {Promise<T> | (() => Promise<T>)} task
 * @param {string} [success] toast shown on success
 * @returns {Promise<T | undefined>}
 */
export async function run(task, success = '') {
	try {
		const result = await (typeof task === 'function' ? task() : task);
		if (success) toasts.success(success);
		return result ?? /** @type {any} */ (true);
	} catch (err) {
		toasts.error(err?.message || 'Action failed');
		return undefined;
	}
}

export const accountPath = (/** @type {string} */ id) => `/api/accounts/${encodeURIComponent(id)}`;
