<script>
	import { groupInfo, ensureGroups } from '$lib/stores/groups.js';
	import UserLink from '../ui/UserLink.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import Icon from '../ui/Icon.svelte';
	import { untrack } from 'svelte';
	import { accountLabel, loggedInAccounts } from '$lib/stores/accounts.js';
	import { friendList, friendIndex, friendsData } from '$lib/stores/friends.js';
	import { closeOverlay, openWorld, openUser } from '$lib/stores/overlay.js';
	import { api } from '$lib/client/api.js';
	import { copyText, selfInvite, playAs, relayAs, instanceLink } from '$lib/client/actions.js';
	import { accountsWithAccess, relayOptions } from '$lib/client/join.js';
	import { byName } from '$lib/client/friends.js';
	import { createResource } from '$lib/client/resource.svelte.js';
	import { describeLocation, parseLocation } from '$lib/shared/location.js';
	import Modal from '../ui/Modal.svelte';
	import Hero from '../ui/Hero.svelte';
	import Avatar from '../ui/Avatar.svelte';
	import Block from '../ui/Block.svelte';
	import Facts from '../ui/Facts.svelte';
	import Fact from '../ui/Fact.svelte';
	import AccessBadge from '../ui/AccessBadge.svelte';
	import Notice from '../ui/Notice.svelte';
	import FriendChip from '../friends/FriendChip.svelte';
	import InviteFriendsDialog from './InviteFriendsDialog.svelte';

	/** @type {{ request: { location: string, accountId: string } }} */
	let { request } = $props();

	const location = untrack(() => request.location);
	let accountId = $state(untrack(() => request.accountId));
	const parsed = parseLocation(location);
	const place = describeLocation(location);

	const res = createResource((aid) => api('/api/instance', { query: { location, accountId: aid } }));
	$effect(() => {
		untrack(() => res.load(request.accountId));
	});
	const world = $derived(res.data?.world);
	const live = $derived(res.data?.instance);

	/** who may open it, per access type */
	const WHO = {
		public: 'Anyone can join.',
		friends: 'Friends of the owner.',
		'friends+': 'Friends of the owner and friends of people already in the instance.',
		invite: 'Only people the owner invites.',
		'invite+': 'Invite only; anyone can ask the owner for an invite.',
		group: 'Members of the group (some groups limit it to certain roles).',
		groupPlus: 'Group members and their friends.',
		groupPublic: 'Anyone; the group hosts it.'
	};

	// our friends standing in this instance right now, and our own accounts in it
	const here = $derived($friendList.filter((f) => f.location === location).sort(byName));
	const ours = $derived(($friendsData.self || []).filter((s) => s.location === location));
	const access = $derived(accountsWithAccess(location));
	const relay = $derived(relayOptions(location));

	const ownerFriend = $derived(parsed.userId ? $friendIndex.get(parsed.userId) : null);
	const platforms = $derived(live?.platforms ? Object.entries(live.platforms).filter(([, n]) => n) : []);
	const PLATFORM = { standalonewindows: 'PC', android: 'Android', ios: 'iOS' };

	let inviteOpen = $state(false);
	let relayOpen = $state(false);
	$effect(() => {
		if (parsed.groupId) ensureGroups([parsed.groupId], accountId);
	});
	let accOpen = $state(false);
	// with many accounts that can open it (a public room: all of them) only one row is shown, the rest is folded:
	// the account picked in "As …" at the top, else the first
	const primary = $derived(access.find((x) => x.account.id === accountId) || access[0]);
	const fold = $derived(access.length > 2);
	const shownAccess = $derived(fold ? [primary] : access);
	const restAccess = $derived(fold ? access.filter((x) => x !== primary) : []);
	let busy = $state('');
	// one trip through the first account that has access invites every relay account it is a friend of
	const relayAll = $derived.by(() => {
		if (relay.length < 2) return null;
		const via = relay[0].via;
		const targets = relay.filter((o) => o.via.id === via.id).map((o) => o.account);
		return targets.length > 1 ? { via, targets } : null;
	});
	async function inviteAll() {
		busy = 'all';
		await relayAs(relayAll.via.id, accountLabel(relayAll.via), relayAll.targets.map((t) => ({ id: t.id, label: accountLabel(t) })), location, 'invite');
		busy = '';
	}
	async function relayJoin(b, via, mode) {
		busy = `${b.id}:${mode}`;
		await relayAs(via.id, accountLabel(via), [{ id: b.id, label: accountLabel(b) }], location, mode);
		busy = '';
	}
	async function join(a) {
		busy = a.id;
		await playAs(a.id, accountLabel(a), location);
		busy = '';
	}
</script>

<Modal size="lg" flush onclose={closeOverlay}>
	{#if res.loading && !res.data}
		<Notice kind="loading" text="Loading instance…" />
	{:else if res.error}
		<Notice kind="error" text={res.error} onretry={() => res.load(request.accountId)} />
	{:else}
		<Hero bg={world?.imageUrl || world?.thumbnailUrl} {accountId}>
			<Avatar src={world?.thumbnailUrl || world?.imageUrl} name={world?.name || parsed.worldId} size={80} {accountId} square />
			<div class="who">
				<h2>
					<button class="wlink" title="Open the world" onclick={() => openWorld(parsed.worldId, accountId, location)}>{world?.name || parsed.worldId}</button>
				</h2>
				<div class="line">
					<span class="mono iid">#{parsed.instanceName}</span>
					<AccessBadge {place} showPublic />
					{#if live?.full}<span class="badge warn">Full</span>{/if}
					{#if live?.closedAt}<span class="badge danger">Closed</span>{/if}
				</div>
				<div class="stats">
					<span title="Players"><Icon name="users" /> {live?.users ?? '?'}{live?.capacity ? ` / ${live.capacity}` : ''}</span>
					<span title="Friends here"><Icon name="user" /> {here.length} friends</span>
					{#if live?.queueEnabled}<span title="Queue">Queue {live.queueSize}</span>{/if}
				</div>
			</div>
		</Hero>

		<div class="bar">
			<button class="btn ghost sm" onclick={() => copyText(instanceLink(location), 'instance link')}><Icon name="link" /> Link</button>
			<button class="btn ghost sm" onclick={() => copyText(location, 'instance location')}><Icon name="copy" /> Location</button>
			<button class="btn ghost sm" disabled={!accountId} onclick={() => (inviteOpen = true)}><Icon name="send" /> Invite friends</button>
			<span class="spacer"></span>
			{#if $loggedInAccounts.length > 1}
				<select class="acc-select" bind:value={accountId} title="Account used to invite">
					{#each $loggedInAccounts as a (a.id)}<option value={a.id}>As {accountLabel(a)}</option>{/each}
				</select>
			{/if}
		</div>

		<div class="pane">
			<Block title="Join" hint="Accounts that can open this instance">
				{#if !access.length && !relay.length}
					<Notice icon="door" text="None of your logged-in accounts has access to this instance. {WHO[place.accessTypeLabel] || WHO[place.accessType] || ''}" />
				{:else if access.length}
					{#snippet accRow({ account: a, reason })}
						<li>
							<Avatar src={a.currentUser?.currentAvatarThumbnailImageUrl} name={accountLabel(a)} size={32} accountId={a.id} />
							<div class="n"><strong><UserLink id={a.currentUser?.id} name={accountLabel(a)} accountId={a.id} /></strong><span class="faint small">{reason}</span></div>
							<span class="spacer"></span>
							<button class="btn xs" title="Invite this account to the instance (works for every access type)" onclick={() => selfInvite(a.id, location)}><Icon name="mail" /> Invite myself</button>
							<button class="btn primary xs" disabled={busy === a.id} onclick={() => join(a)}><Icon name="play" /> {busy === a.id ? 'Starting…' : 'Join in game'}</button>
						</li>
					{/snippet}
					<ul class="acc">
						{#each shownAccess as x (x.account.id)}{@render accRow(x)}{/each}
					</ul>
					{#if restAccess.length}
						<div class="via">
							<Section title="Other accounts" icon="user" count={restAccess.length} open={accOpen} ontoggle={(o) => (accOpen = o)}>
								<ul class="acc">
									{#each restAccess as x (x.account.id)}{@render accRow(x)}{/each}
								</ul>
							</Section>
						</div>
					{/if}
				{/if}
			</Block>

			{#if relay.length}
				<div class="via">
					<Section title="Via a friend" icon="mail" count={relay.length} open={relayOpen} ontoggle={(o) => (relayOpen = o)}>
						{#snippet actions()}
							{#if relayAll}
								<button class="btn xs" disabled={!!busy} title="One trip through {accountLabel(relayAll.via)}: it enters and invites all of them" onclick={(e) => { e.stopPropagation(); inviteAll(); }}><Icon name="mail" /> {busy === 'all' ? 'Inviting…' : `Invite all ${relayAll.targets.length}`}</button>
							{/if}
						{/snippet}
						<p class="faint small hint">These accounts cannot open it themselves. A friend's account enters the instance for a few seconds (others there see it join and leave) and sends the invite, because VRChat only lets someone inside the instance invite. <b>Invite</b> stops there, <b>Join in game</b> then starts the game as the invited account.</p>
						<ul class="acc">
							{#each relay as { account: b, via } (b.id)}
								<li>
									<Avatar src={b.currentUser?.currentAvatarThumbnailImageUrl} name={accountLabel(b)} size={32} accountId={b.id} />
									<div class="n"><strong><UserLink id={b.currentUser?.id} name={accountLabel(b)} accountId={b.id} /></strong><span class="faint small">Relay through <UserLink id={via.currentUser?.id} name={accountLabel(via)} accountId={via.id} /></span></div>
									<span class="spacer"></span>
									<button class="btn xs" disabled={!!busy} title="{accountLabel(via)}'s account enters the instance for a few seconds to send the invite, then the game closes. This account does not enter: accept the invite later in the game or on vrchat.com" onclick={() => relayJoin(b, via, 'invite')}><Icon name="mail" /> {busy === b.id + ':invite' ? 'Inviting…' : 'Invite'}</button>
									<button class="btn primary xs" disabled={!!busy} title="Invite, then start the game as this account in the instance" onclick={() => relayJoin(b, via, 'join')}><Icon name="play" /> {busy === b.id + ':join' ? 'Starting…' : 'Join in game'}</button>
								</li>
							{/each}
						</ul>
					</Section>
				</div>
			{/if}

			<Block title="Who is here" hint={ours.length ? `Your accounts: ${ours.length}` : ''}>
				{#if here.length}
					<div class="people">
						{#each here as f (f.id)}<FriendChip friend={f} />{/each}
					</div>
				{:else}
					<span class="faint">None of your friends is listed here right now.</span>
				{/if}
			</Block>

			<Block title="Details">
				<Facts>
					<Fact label="Access">{place.accessLabel || 'Public'}<div class="faint small">{WHO[place.accessTypeLabel] || WHO[place.accessType] || ''}</div></Fact>
					<Fact label="Owner">
						{#if parsed.userId}
							<button class="link" onclick={() => openUser(parsed.userId, { accountId })}>{ownerFriend?.displayName || parsed.userId.slice(0, 12) + '…'}</button>
						{:else if parsed.groupId}
							<a class="link" target="_blank" rel="noreferrer" href="https://vrchat.com/home/group/{parsed.groupId}">{$groupInfo[parsed.groupId]?.name || `Group ${parsed.groupId.slice(0, 12)}…`}</a>
							{#if $groupInfo[parsed.groupId]?.shortCode}<div class="faint small">{$groupInfo[parsed.groupId].shortCode}.{$groupInfo[parsed.groupId].discriminator}{#if $groupInfo[parsed.groupId].memberCount != null} · {$groupInfo[parsed.groupId].memberCount} members{/if}</div>{/if}
						{:else}<span class="faint">None (public)</span>{/if}
					</Fact>
					<Fact label="Region">{(live?.region || parsed.region || '—').toUpperCase()}</Fact>
					<Fact label="Players">{live?.users ?? '—'}{live?.capacity ? ` of ${live.capacity}` : ''}</Fact>
					{#if platforms.length}<Fact label="Platforms">{platforms.map(([k, n]) => `${PLATFORM[k] || k} ${n}`).join(' · ')}</Fact>{/if}
					<Fact label="Instance ID"><span class="mono">{parsed.instanceName}</span></Fact>
				</Facts>
			</Block>
		</div>
	{/if}
</Modal>

{#if inviteOpen}
	<InviteFriendsDialog {accountId} {location} onclose={() => (inviteOpen = false)} />
{/if}

<style>
	.who {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h2 {
		font-size: 21px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.wlink:hover {
		text-decoration: underline;
	}
	.line,
	.stats {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 14px;
		font-size: 13px;
		color: var(--text-dim);
	}
	.line {
		gap: 6px;
	}
	.iid {
		font-weight: 650;
		color: var(--text);
	}
	.bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
	}
	.acc-select {
		width: auto;
		max-width: 200px;
		padding: 3px 8px;
		font-size: 12px;
	}
	.pane {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 16px 20px 20px;
	}
	.via {
		margin-top: 14px;
		border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
		border-radius: 10px;
		overflow: hidden;
	}
	.via .hint {
		margin: 0 0 8px;
		padding: 0 12px;
	}
	.via .acc {
		padding: 0 4px 4px;
	}
	.all {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 10px;
	}
	.acc {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.acc li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
	}
	.n {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.people {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.link {
		color: var(--link);
	}
	.link:hover {
		text-decoration: underline;
	}
</style>
