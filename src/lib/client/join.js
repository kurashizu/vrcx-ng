import { get } from 'svelte/store';
import { accounts, accountLabel } from '$lib/stores/accounts.js';
import { friendList } from '$lib/stores/friends.js';
import { showContextMenu } from '$lib/stores/overlay.js';
import { toasts } from '$lib/stores/toast.js';
import { parseLocation } from '$lib/shared/location.js';
import { playAs } from './actions.js';

/**
 * Which logged-in accounts can open an instance, and why. Decided from what we know:
 *   public / group public  every account
 *   group / group plus     every account (membership is not known here; the game reports a failed join)
 *   friends                friends of the owner, or the owner's own account
 *   friends+               friends of the owner, friends of someone standing in the instance, or the owner's account
 *   invite / invite+       only the owner's own account (anyone else needs an invite first)
 * @param {string} location
 * @returns {{ account: any, reason: string }[]}
 */
export function accountsWithAccess(location) {
	const p = parseLocation(location);
	if (!p.isRealInstance || !p.instanceId) return [];
	const friends = get(friendList);
	const owner = p.userId ? friends.find((f) => f.id === p.userId) : null;
	const there = friends.filter((f) => f.location === location);
	const out = [];
	for (const a of get(accounts)) {
		if (!a.loggedIn || !a.currentUser?.id) continue;
		const mine = a.currentUser.id === p.userId;
		const friendOfOwner = !!owner?.accountIds?.includes(a.id);
		let reason = '';
		switch (p.accessType) {
			case 'public':
			case 'groupPublic':
				reason = 'Public';
				break;
			case 'group':
			case 'groupPlus':
				reason = 'Group (membership not checked)';
				break;
			case 'friends':
				reason = mine ? 'Own instance' : friendOfOwner ? 'Friend of the owner' : '';
				break;
			case 'friends+':
				reason = mine ? 'Own instance' : friendOfOwner ? 'Friend of the owner' : there.some((f) => f.accountIds?.includes(a.id)) ? 'Friend of someone there' : '';
				break;
			case 'invite':
			case 'invite+':
				reason = mine ? 'Own instance' : '';
				break;
		}
		if (reason) out.push({ account: a, reason });
	}
	return out;
}

/** One menu item per account that may join (flat list, for a menu opened from a button). */
export function joinAccountItems(location) {
	return accountsWithAccess(location).map(({ account, reason }) => ({
		icon: 'user',
		label: `${accountLabel(account)} · ${reason}`,
		action: () => playAs(account.id, accountLabel(account), location)
	}));
}

/** A single entry for a bigger menu: "Join in game as ▸" with the accounts that have access. */
export function joinMenuItem(location, { disabled = false } = {}) {
	const list = accountsWithAccess(location);
	if (disabled) return { icon: 'play', label: 'Join in game', disabled: true };
	if (!list.length) return { icon: 'play', label: 'Join in game (no account has access)', disabled: true };
	if (list.length === 1) {
		const { account } = list[0];
		return { icon: 'play', label: `Join in game as ${accountLabel(account)}`, action: () => playAs(account.id, accountLabel(account), location) };
	}
	return { icon: 'play', label: 'Join in game as…', sub: joinAccountItems(location) };
}

/** Open the account picker next to a button. */
export function openJoinMenu(event, location) {
	const items = joinAccountItems(location);
	if (!items.length) return toasts.error('No logged-in account has access to this instance');
	const r = event.currentTarget.getBoundingClientRect();
	showContextMenu({ x: r.left, y: r.bottom + 4, header: { title: 'Join in game as' }, items });
}
