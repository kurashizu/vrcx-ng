import { get } from 'svelte/store';
import { accounts, accountLabel } from '$lib/stores/accounts.js';
import { friendGroups, setFriendGroupMember } from '$lib/stores/friends.js';
import { openUser, showContextMenu } from '$lib/stores/overlay.js';
import { describeLocation } from '$lib/shared/location.js';
import { run } from './api.js';
import { copyText, selfInvite, requestInvite, muteUser, blockUser, openVrcProfile, instanceLink } from './actions.js';

/**
 * One menu item — or, when several accounts could perform it, an item that
 * opens a sub-menu to pick the account.
 */
function perAccount(accts, base, fn) {
	if (accts.length <= 1) return { ...base, disabled: base.disabled || !accts.length, action: () => fn(accts[0]?.id) };
	return { ...base, sub: accts.map((a) => ({ icon: '👤', label: accountLabel(a), action: () => fn(a.id) })) };
}

/**
 * Items of the friend context menu.
 * @param {{ id: string, displayName?: string, location?: string, worldName?: string, accountIds?: string[] }} f
 */
export function friendMenuItems(f) {
	const loggedIn = get(accounts).filter((a) => a.loggedIn);
	let accts = loggedIn.filter((a) => f.accountIds?.includes(a.id));
	if (!accts.length) accts = loggedIn.slice(0, 1);
	const inInstance = describeLocation(f.location).kind === 'instance';
	const { groups, members } = get(friendGroups);

	return [
		{ icon: '👤', label: '查看详情', action: () => openUser(f.id, { accountId: f.accountIds?.[0], name: f.displayName }) },
		{ divider: true },
		perAccount(accts, { icon: '✉️', label: '请求加入 TA 的实例' }, (id) => requestInvite(id, f.id)),
		perAccount(accts, { icon: '🎯', label: '邀请自己到 TA 的实例' }, (id) => selfInvite(id, f.location)),
		{ icon: '🔗', label: '复制实例链接', disabled: !inInstance, action: () => copyText(instanceLink(f.location), '实例链接') },
		{ divider: true },
		perAccount(accts, { icon: '🔕', label: '静音' }, (id) => muteUser(id, f.id)),
		perAccount(accts, { icon: '🚫', label: '屏蔽', danger: true }, (id) => blockUser(id, f.id, f.displayName)),
		...(groups.length
			? [
					{ divider: true },
					{
						icon: '🗂',
						label: '分组',
						sub: groups.map((g) => {
							const member = !!members[g.name]?.includes(f.id);
							return {
								icon: member ? '✓' : '＋',
								label: g.displayName,
								action: () => run(() => setFriendGroupMember(g.name, f.id, !member), member ? '已移出分组' : '已加入分组')
							};
						})
					}
				]
			: []),
		{ divider: true },
		{ icon: '📋', label: '复制显示名', action: () => copyText(f.displayName || f.id, '显示名') },
		{ icon: '🆔', label: '复制用户 ID', action: () => copyText(f.id, '用户 ID') },
		{ icon: '🌐', label: '在 VRChat 网站打开', action: () => openVrcProfile(f.id) }
	];
}

/** `oncontextmenu` handler for anything that represents a friend. */
export function openFriendMenu(event, f) {
	event.preventDefault();
	showContextMenu({
		x: event.clientX,
		y: event.clientY,
		header: { title: f.displayName || f.id, subtitle: f.worldName || undefined },
		items: friendMenuItems(f)
	});
}
