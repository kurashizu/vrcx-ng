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
