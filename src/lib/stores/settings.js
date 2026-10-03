import { writable, get } from 'svelte/store';
import { toasts } from './toast.js';

/**
 * Client-side mirror of server settings. Loaded on startup; updates are
 * debounced and POSTed to /api/settings (a failed save is retried and
 * reported). Other tabs pick changes up on their next load.
 */

export const settings = writable(/** @type {Record<string, any>} */ ({}));
export const settingsLoaded = writable(false);

let saveTimer = null;
const pending = {};

/**
 * Initialize the settings store. Called from +layout.svelte on mount.
 */
export async function loadSettings() {
	try {
		const r = await fetch('/api/settings');
		const j = await r.json();
		settings.set(j.settings || {});
		settingsLoaded.set(true);
		// React to theme immediately
		const themeKey = 'ui.theme';
		applyTheme(get(settings)[themeKey]);
	} catch (err) {
		console.error('load settings failed', err);
	}
}

/**
 * Update a single setting. Debounced to avoid hammering the server.
 * @param {string} key
 * @param {any} value
 */
export function updateSetting(key, value) {
	settings.update((s) => ({ ...s, [key]: value }));

	// Theme: apply instantly on the client
	if (key === 'ui.theme') applyTheme(value);

	pending[key] = value;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(flushSettings, 300);
}

async function flushSettings() {
	if (Object.keys(pending).length === 0) return;
	const updates = { ...pending };
	for (const k of Object.keys(pending)) delete pending[k];
	saveTimer = null;
	try {
		const r = await fetch('/api/settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ updates })
		});
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	} catch (err) {
		console.error('save settings failed', err);
		// keep the unsaved values (newer edits win) and try again shortly
		for (const [k, v] of Object.entries(updates)) if (!(k in pending)) pending[k] = v;
		toasts.error('设置保存失败，稍后重试');
		if (!saveTimer) saveTimer = setTimeout(flushSettings, 5000);
	}
}

/**
 * Reset to defaults. Pass null/empty to reset all, or a key for one.
 */
export async function resetSettings(key = null) {
	const url = '/api/settings' + (key ? `?key=${encodeURIComponent(key)}` : '');
	const r = await fetch(url, { method: 'DELETE' });
	const j = await r.json();
	settings.set(j.settings || {});
	applyTheme(j.settings?.['ui.theme'] || 'dark');
}

/**
 * Apply theme to <html>. 'system' follows prefers-color-scheme.
 * @param {string} theme 'dark' | 'light' | 'system'
 */
export function applyTheme(theme) {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	if (theme === 'light') {
		root.dataset.theme = 'light';
	} else if (theme === 'system') {
		const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
		root.dataset.theme = sysDark ? 'dark' : 'light';
	} else {
		root.dataset.theme = 'dark';
	}
}

/**
 * Read the current value of a setting.
 */
export function getSetting(key) {
	return get(settings)[key];
}
