import { writable, derived, get } from 'svelte/store';
import { api } from '$lib/client/api.js';
import { toasts } from './toast.js';

/**
 * Client-side mirror of the server settings. Single edits are debounced and
 * POSTed to /api/settings (a failed save is retried and reported).
 */
export const settings = writable(/** @type {Record<string, any>} */ ({}));
export const settingsLoaded = writable(false);

/** Trust-rank name colours (default on). */
export const trustColorsOn = derived(settings, ($s) => $s['ui.trustColors'] !== false);

export async function loadSettings() {
	try {
		const j = await api('/api/settings');
		settings.set(j.settings || {});
		settingsLoaded.set(true);
		applyTheme(get(settings)['ui.theme']);
	} catch (err) {
		console.error('load settings failed', err);
	}
}

export function getSetting(key) {
	return get(settings)[key];
}

let saveTimer = null;
const pending = {};

/** Update one setting (applied immediately, saved after a short debounce). */
export function updateSetting(key, value) {
	settings.update((s) => ({ ...s, [key]: value }));
	if (key === 'ui.theme') applyTheme(value);
	pending[key] = value;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(flush, 300);
}

async function flush() {
	saveTimer = null;
	const updates = { ...pending };
	if (!Object.keys(updates).length) return;
	for (const k of Object.keys(updates)) delete pending[k];
	try {
		await api('/api/settings', { method: 'POST', body: { updates } });
	} catch (err) {
		console.error('save settings failed', err);
		// keep the unsaved values (newer edits win) and retry shortly
		for (const [k, v] of Object.entries(updates)) if (!(k in pending)) pending[k] = v;
		toasts.error('设置保存失败，稍后重试');
		if (!saveTimer) saveTimer = setTimeout(flush, 5000);
	}
}

/** Save several settings at once (settings import). */
export async function saveSettings(updates) {
	await api('/api/settings', { method: 'POST', body: { updates } });
	settings.update((s) => ({ ...s, ...updates }));
	if ('ui.theme' in updates) applyTheme(updates['ui.theme']);
}

/** Reset one key (or everything) to its default. */
export async function resetSettings(key = null) {
	const j = await api('/api/settings', { method: 'DELETE', query: { key } });
	settings.set(j.settings || {});
	applyTheme(j.settings?.['ui.theme'] || 'dark');
}

/** Apply the theme to <html>. 'system' follows prefers-color-scheme. */
export function applyTheme(theme) {
	if (typeof document === 'undefined') return;
	try {
		localStorage.setItem('vrcx-ng:theme', theme || 'dark');
	} catch {}
	const dark = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : theme !== 'light';
	document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
