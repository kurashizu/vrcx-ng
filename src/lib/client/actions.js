import { api, run, accountPath } from './api.js';
import { toasts } from '$lib/stores/toast.js';
import { askConfirm } from '$lib/stores/overlay.js';

/** POST /api/accounts/:id/actions — everything a friend/user can be sent or subjected to. */
export const act = (accountId, action, userId, extra = {}) =>
	api(`${accountPath(accountId)}/actions`, { method: 'POST', body: { action, userId, ...extra } });

function legacyCopy(value) {
	const ta = document.createElement('textarea');
	ta.value = value;
	ta.style.cssText = 'position:fixed;opacity:0';
	document.body.appendChild(ta);
	ta.select();
	const ok = document.execCommand('copy');
	ta.remove();
	if (!ok) throw new Error('copy failed');
}

/** Copy to the clipboard (works on plain-http LAN origins too) and toast the result. */
export async function copyText(text, what = 'text') {
	const value = String(text ?? '');
	if (!value) return;
	try {
		if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
		else legacyCopy(value);
		toasts.success(`Copied ${what}`);
	} catch {
		toasts.error('Copy failed');
	}
}

/** Invite the account itself to an instance (the game then shows the invite). */
export async function selfInvite(accountId, location) {
	const loc = String(location || '');
	if (!accountId) return toasts.error('Choose an account');
	if (!loc || loc === 'offline' || loc === 'traveling') return toasts.error('Self-invite failed: not in any instance');
	if (loc === 'private') return toasts.error('Self-invite failed: they are hidden, so the instance is unknown');
	if (!loc.startsWith('wrld_') || !loc.includes(':') || loc.includes('undefined') || loc.endsWith(':'))
		return toasts.error(`Self-invite failed: invalid instance location (${loc || 'empty'})`);
	const ok = await run(
		() => api(`${accountPath(accountId)}/instance-action`, { method: 'POST', body: { action: 'selfInvite', location: loc } }),
		'Self-invite sent; accept it in game'
	);
	return !!ok;
}

export const requestInvite = (accountId, userId, extra = {}) =>
	run(() => act(accountId, 'requestInvite', userId, extra), 'Join request sent');

export const inviteUser = (accountId, userId, extra = {}) =>
	run(() => act(accountId, 'invite', userId, extra), 'Invite sent');

export const muteUser = (accountId, userId) => run(() => act(accountId, 'mute', userId), 'Muted');

export async function blockUser(accountId, userId, name = '') {
	if (!(await askConfirm(`Block ${name || 'this user'}?`, { okLabel: 'Block', danger: true }))) return;
	return run(() => act(accountId, 'block', userId), 'Blocked');
}

export const openVrcProfile = (userId) => window.open(`https://vrchat.com/home/user/${userId}`, '_blank', 'noopener');

export const instanceLink = (location) => {
	const [worldId, instanceId] = String(location || '').split(':');
	return `https://vrchat.com/home/launch?worldId=${encodeURIComponent(worldId || '')}&instanceId=${encodeURIComponent(instanceId || '')}`;
};

/** Start the desktop game client logged in as this account (the server finds the right game profile). */
export async function playAs(accountId, label = '', location = '') {
	toasts.push(`Starting the game${label ? ` as ${label}` : ''}${location ? ' and joining the instance' : ''}… (about ${location ? 30 : 20} seconds)`, 'info', 8000);
	try {
		const r = await api(`${accountPath(accountId)}/game`, { method: 'POST', body: location ? { location } : {} });
		if (r.needLogin) toasts.push(`No saved login for this account yet: log in once in the game window (profile ${r.profile}), then this button works in one click`, 'info', 12000);
		else if (r.join?.room) toasts.success(`${r.name} joined ${r.join.room}`);
		else if (r.join?.failed) toasts.error(`Game started as ${r.name}, but: ${r.join.failed}`);
		else toasts.success(`Game started as ${r.name}`);
		return r;
	} catch (err) {
		toasts.error(err.message);
	}
}

/**
 * Relay through an account that has access: it enters the instance and invites the targets from inside, then the game is closed.
 * mode 'join' also starts the game as the (single) target in the instance; 'invite' leaves the invites for the targets to accept.
 * @param {string} fromId @param {string} fromLabel @param {{ id: string, label: string }[]} targets @param {string} location @param {'join'|'invite'} mode
 */
export async function relayAs(fromId, fromLabel, targets, location, mode = 'join') {
	const names = targets.map((t) => t.label).join(', ');
	toasts.push(`Relay: joining as ${fromLabel} to invite ${names}${mode === 'join' ? ', then starting the game as them' : ''}… (about ${mode === 'join' ? '1–2 minutes' : '1 minute'})`, 'info', 15000);
	try {
		const r = await api(`${accountPath(fromId)}/relay`, { method: 'POST', body: { to: targets.map((t) => t.id), location, mode } });
		if (r.needLogin) toasts.push(`No saved login for this account yet: log in once in the game window (profile ${r.profile}), then try again`, 'info', 12000);
		else if (mode === 'invite') toasts.success(`${r.from} invited ${r.invited.join(', ')}: accept the invite in the game or on vrchat.com`);
		else if (r.join?.room) toasts.success(`${r.to} joined ${r.join.room} (invited by ${r.from})`);
		else toasts.error(`${r.to}: ${r.join?.failed || 'the game started but did not join the instance'}`);
		return r;
	} catch (err) {
		toasts.error(err.message);
	}
}
