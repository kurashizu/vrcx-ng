import { get } from 'svelte/store';
import { accounts, accountLabel } from '$lib/stores/accounts.js';
import { friendList } from '$lib/stores/friends.js';
import { receivedInvites, refreshInvites } from '$lib/stores/notifications.js';
import { showContextMenu } from '$lib/stores/overlay.js';
import { toasts } from '$lib/stores/toast.js';
import { parseLocation } from '$lib/shared/location.js';
import { playAs, relayAs } from './actions.js';

/**
 * Which logged-in accounts can open an instance, and why. Decided from what we know:
 *   public / group public  every account
 *   group / group plus     every account (membership is not known here; the game reports a failed join)
 *   friends                friends of the owner, or the owner's own account
 *   friends+               friends of the owner, friends of someone standing in the instance, or the owner's account
 *   invite / invite+       only the owner's own account (anyone else needs an invite first)
 * and any account that was invited to it (a received invite notification), whatever the access type.
 * Each entry says whether the account may invite others from inside (`canInvite`): in an Invite instance only the
 * owner can, everywhere else everyone standing in it can. That decides who can start a relay.
 * @param {string} location
 * @returns {{ account: any, reason: string, canInvite: boolean }[]}
 */
export function accountsWithAccess(location) {
	const p = parseLocation(location);
	if (!p.isRealInstance || !p.instanceId) return [];
	const friends = get(friendList);
	const owner = p.userId ? friends.find((f) => f.id === p.userId) : null;
	const there = friends.filter((f) => f.location === location);
	const invites = get(receivedInvites).filter((i) => i.location === location);
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
		if (!reason) {
			const inv = invites.find((i) => i.accountId === a.id);
			if (inv) reason = `Invited${inv.from ? ` by ${inv.from}` : ''}`;
		}
		if (reason) out.push({ account: a, reason, canInvite: p.accessType !== 'invite' || mine });
	}
	return out;
}

/**
 * Accounts that cannot open the instance themselves but can be invited from one that can: they are a friend of an
 * account with access (an invite is only possible between friends, and only from inside the instance).
 * @returns {{ account: any, via: any }[]}
 */
export function relayOptions(location) {
	const all = accountsWithAccess(location);
	const has = new Set(all.map((x) => x.account.id));
	// only an account that may invite from inside can relay
	const withAccess = all.filter((x) => x.canInvite);
	if (!withAccess.length) return [];
	const friends = get(friendList);
	const out = [];
	for (const b of get(accounts)) {
		if (!b.loggedIn || !b.currentUser?.id || has.has(b.id)) continue;
		for (const { account: a } of withAccess) {
			// the friend entry of account A (as someone's friend) lists the accounts it is a friend of
			if (friends.find((f) => f.id === a.currentUser.id)?.accountIds?.includes(b.id)) {
				out.push({ account: b, via: a });
				break;
			}
		}
	}
	return out;
}

/** One menu item per account that may join (flat list, for a menu opened from a button), then the relay ones. */
export function joinAccountItems(location) {
	const direct = accountsWithAccess(location).map(({ account, reason }) => ({
		icon: 'user',
		label: `${accountLabel(account)} · ${reason}`,
		action: () => playAs(account.id, accountLabel(account), location)
	}));
	const opts = relayOptions(location);
	const target = (b) => ({ id: b.id, label: accountLabel(b) });
	const relay = opts.flatMap(({ account, via }) => [
		{ icon: 'play', label: `${accountLabel(account)} · Join in game (relay via ${accountLabel(via)})`, action: () => relayAs(via.id, accountLabel(via), [target(account)], location, 'join') },
		{ icon: 'mail', label: `${accountLabel(account)} · Invite (relay via ${accountLabel(via)})`, action: () => relayAs(via.id, accountLabel(via), [target(account)], location, 'invite') }
	]);
	// one entry that invites every relay account at once, through the first account that has access
	if (opts.length > 1) {
		const via = opts[0].via;
		const all = opts.filter((o) => o.via.id === via.id).map((o) => target(o.account));
		if (all.length > 1) relay.push({ icon: 'mail', label: `Invite all ${all.length} other accounts (relay via ${accountLabel(via)})`, action: () => relayAs(via.id, accountLabel(via), all, location, 'invite') });
	}
	return [...direct, ...relay];
}

/** A single entry for a bigger menu: "Join in game as ▸" with the accounts that have access. */
export function joinMenuItem(location, { disabled = false } = {}) {
	const list = accountsWithAccess(location);
	if (disabled) return { icon: 'play', label: 'Join in game', disabled: true };
	if (!list.length) return { icon: 'play', label: 'Join in game (no account has access)', disabled: true };
	if (list.length === 1 && !relayOptions(location).length) {
		const { account } = list[0];
		return { icon: 'play', label: `Join in game as ${accountLabel(account)}`, action: () => playAs(account.id, accountLabel(account), location) };
	}
	return { icon: 'play', label: 'Join in game as…', sub: joinAccountItems(location) };
}

/** Open the account picker next to a button. */
export async function openJoinMenu(event, location) {
	// the menu depends on invites received a moment ago: read them fresh (a failure keeps the cached list)
	const el = event.currentTarget;
	await refreshInvites().catch(() => {});
	const items = joinAccountItems(location);
	if (!items.length) return toasts.error('No logged-in account has access to this instance');
	const r = el.getBoundingClientRect();
	showContextMenu({ x: r.left, y: r.bottom + 4, header: { title: 'Join in game as' }, items });
}
