import { json } from '@sveltejs/kit';
import { loadSettings, setSettings, resetSettings, getDefaults } from '$lib/server/settings.js';

export async function GET() {
	return json({
		settings: loadSettings(),
		defaults: getDefaults()
	});
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const updates = body?.updates;
	if (!updates || typeof updates !== 'object') {
		return json({ error: 'updates required' }, { status: 400 });
	}
	setSettings(updates);
	return json({ ok: true, settings: loadSettings() });
}

export async function DELETE({ url }) {
	const key = url.searchParams.get('key');
	resetSettings(key);
	return json({ ok: true, settings: loadSettings() });
}
