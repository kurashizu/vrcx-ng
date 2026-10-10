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
	return { ...base, sub: accts.map((a) => ({ icon: 'user', label: accountLabel(a), action: () => fn(a.id) })) };
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
		{ icon: 'user', label: 'View details', action: () => openUser(f.id, { accountId: f.accountIds?.[0], name: f.displayName }) },
		{ divider: true },
		perAccount(accts, { icon: 'mail', label: 'Request invite' }, (id) => requestInvite(id, f.id)),
		perAccount(accts, { icon: 'target', label: 'Invite myself to their instance' }, (id) => selfInvite(id, f.location)),
		{ icon: 'link', label: 'Copy instance link', disabled: !inInstance, action: () => copyText(instanceLink(f.location), 'instance link') },
		{ divider: true },
		perAccount(accts, { icon: 'bell-off', label: 'Mute' }, (id) => muteUser(id, f.id)),
		perAccount(accts, { icon: 'ban', label: 'Block', danger: true }, (id) => blockUser(id, f.id, f.displayName)),
		...(groups.length
			? [
					{ divider: true },
					{
						icon: 'folder',
						label: 'Group',
						sub: groups.map((g) => {
							const member = !!members[g.name]?.includes(f.id);
							return {
								icon: member ? 'check' : 'plus',
								label: g.displayName,
								action: () => run(() => setFriendGroupMember(g.name, f.id, !member), member ? 'Removed from group' : 'Added to group')
							};
						})
					}
				]
			: []),
		{ divider: true },
		{ icon: 'copy', label: 'Copy display name', action: () => copyText(f.displayName || f.id, 'display name') },
		{ icon: 'hash', label: 'Copy user ID', action: () => copyText(f.id, 'user ID') },
		{ icon: 'globe', label: 'Open on vrchat.com', action: () => openVrcProfile(f.id) }
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
