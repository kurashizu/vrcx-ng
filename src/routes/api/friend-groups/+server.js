import { json } from '@sveltejs/kit';
import * as groups from '$lib/server/friendGroups.js';

export async function GET() {
	const list = groups.listGroups();
	const members = {};
	for (const g of list) {
		members[g.name] = groups.listMembers(g.name);
	}
	return json({ groups: list, members });
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const action = body?.action;
	try {
		if (action === 'create') {
			const g = groups.createGroup(body);
			return json({ ok: true, group: g });
		}
		if (action === 'update') {
			const g = groups.updateGroup(body.name, body);
			return json({ ok: true, group: g });
		}
		if (action === 'delete') {
			groups.deleteGroup(body.name);
			return json({ ok: true });
		}
		if (action === 'addMember') {
			groups.addMember(body);
			return json({ ok: true });
		}
		if (action === 'removeMember') {
			groups.removeMember(body);
			return json({ ok: true });
		}
		return json({ error: 'unknown action' }, { status: 400 });
	} catch (err) {
		return json({ ok: false, error: err.message }, { status: 400 });
	}
}
