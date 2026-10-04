import { api, run, accountPath } from './api.js';
import { toasts } from '$lib/stores/toast.js';
import { askConfirm } from '$lib/stores/overlay.js';
import { vrcLaunchUrl } from '$lib/shared/trust.js';

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
export async function copyText(text, what = '内容') {
	const value = String(text ?? '');
	if (!value) return;
	try {
		if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
		else legacyCopy(value);
		toasts.success(`已复制${what}`);
	} catch {
		toasts.error('复制失败');
	}
}

/** Hand an instance to the VRChat client through the vrchat:// protocol. */
export function launchInstance(location, shortName = '') {
	const url = vrcLaunchUrl(location, shortName);
	if (!url) {
		toasts.error('无法生成启动链接');
		return false;
	}
	window.location.href = url;
	return true;
}

/** Invite the account itself to an instance, then start the game. */
export async function selfInvite(accountId, location) {
	const loc = String(location || '');
	if (!accountId) return toasts.error('请选择账号');
	if (!loc || loc === 'offline' || loc === 'traveling') return toasts.error('自我邀请失败：当前未加入任何实例');
	if (loc === 'private') return toasts.error('自我邀请失败：对方隐身中，拿不到实例');
	if (!loc.startsWith('wrld_') || !loc.includes(':') || loc.includes('undefined') || loc.endsWith(':'))
		return toasts.error(`自我邀请失败：无效的实例位置 (${loc || '空'})`);
	const ok = await run(
		() => api(`${accountPath(accountId)}/instance-action`, { method: 'POST', body: { action: 'selfInvite', location: loc } }),
		'已发送自我邀请，正在启动游戏…'
	);
	if (ok) launchInstance(loc);
	return !!ok;
}

export const requestInvite = (accountId, userId, extra = {}) =>
	run(() => act(accountId, 'requestInvite', userId, extra), '已发送请求加入');

export const inviteUser = (accountId, userId, extra = {}) =>
	run(() => act(accountId, 'invite', userId, extra), '已发送邀请');

export const muteUser = (accountId, userId) => run(() => act(accountId, 'mute', userId), '已静音');

export async function blockUser(accountId, userId, name = '') {
	if (!(await askConfirm(`确定屏蔽 ${name || '该用户'}？`, { okLabel: '屏蔽', danger: true }))) return;
	return run(() => act(accountId, 'block', userId), '已屏蔽');
}

export const openVrcProfile = (userId) => window.open(`https://vrchat.com/home/user/${userId}`, '_blank', 'noopener');

export const instanceLink = (location) => {
	const [worldId, instanceId] = String(location || '').split(':');
	return `https://vrchat.com/home/launch?worldId=${encodeURIComponent(worldId || '')}&instanceId=${encodeURIComponent(instanceId || '')}`;
};
