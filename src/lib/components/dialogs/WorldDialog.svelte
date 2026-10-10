<script>
	import Icon from '../ui/Icon.svelte';
	import { untrack } from 'svelte';
	import { accountLabel, loggedInAccounts } from '$lib/stores/accounts.js';
	import { closeOverlay } from '$lib/stores/overlay.js';
	import { api, run, accountPath } from '$lib/client/api.js';
	import { copyText, selfInvite, requestInvite } from '$lib/client/actions.js';
	import { createResource } from '$lib/client/resource.svelte.js';
	import { comma, formatDateTime, tagList, prettyTag, shortId } from '$lib/shared/format.js';
	import { describeLocation } from '$lib/shared/location.js';
	import Modal from '../ui/Modal.svelte';
	import Hero from '../ui/Hero.svelte';
	import Avatar from '../ui/Avatar.svelte';
	import Tabs from '../ui/Tabs.svelte';
	import Block from '../ui/Block.svelte';
	import Facts from '../ui/Facts.svelte';
	import Fact from '../ui/Fact.svelte';
	import AccessBadge from '../ui/AccessBadge.svelte';
	import Notice from '../ui/Notice.svelte';
	import InviteFriendsDialog from './InviteFriendsDialog.svelte';
	import VrcFavoriteDialog from './VrcFavoriteDialog.svelte';

	/** @type {{ request: { worldId: string, accountId: string, location?: string } }} */
	let { request } = $props();

	const worldId = untrack(() => request.worldId);
	/** the account that invites / creates instances / favorites */
	let accountId = $state(untrack(() => request.accountId));
	let tab = $state('instances');

	const res = createResource((aid) => api(`/api/worlds/${encodeURIComponent(worldId)}`, { query: { accountId: aid, location: untrack(() => request.location) || undefined } }));
	// the world itself doesn't depend on who looks, so only the first load is keyed by the account
	$effect(() => {
		untrack(() => res.load(request.accountId));
	});

	const w = $derived(res.data);
	const instances = $derived(w?.instances || []);
	const tags = $derived(tagList(w?.tags));
	const authorTags = $derived(tags.filter((t) => t.startsWith('author_tag')));
	const otherTags = $derived(tags.filter((t) => !t.startsWith('author_tag')));
	const packages = $derived(
		[...new Map((w?.unityPackages || []).map((p) => [`${p.platform}/${p.unityVersion}`, p])).values()]
	);
	const fullLocation = (inst) => `${worldId}:${inst.instanceId || inst.id}`;

	const tabs = $derived([
		{ id: 'instances', label: 'Instances', count: instances.length },
		{ id: 'create', label: 'Create instance' },
		{ id: 'info', label: 'Details' }
	]);

	// ---- per-instance actions ----
	let busyLoc = $state('');
	async function inviteSelf(loc) {
		busyLoc = loc;
		await selfInvite(accountId, loc);
		busyLoc = '';
	}
	let inviteTarget = $state(/** @type {string | null} */ (null));
	let favOpen = $state(false);

	// ---- create an instance ----
	const ACCESS = [
		['public', 'Public'],
		['friends', 'Friends'],
		['friends+', 'Friends+'],
		['invite', 'Invite'],
		['invite+', 'Invite+ (can request)']
	];
	const API_TYPE = { public: 'public', friends: 'friends', 'friends+': 'hidden', invite: 'private', 'invite+': 'private' };
	let access = $state('public');
	let region = $state('us');
	let creating = $state(false);
	let created = $state(/** @type {any} */ (null));

	async function create() {
		creating = true;
		const body = { action: 'createInstance', worldId, type: API_TYPE[access], canRequestInvite: access === 'invite+', region };
		const r = await run(() => api(`${accountPath(accountId)}/instance-action`, { method: 'POST', body }), 'Instance created');
		creating = false;
		if (r) created = r.instance;
	}
</script>

<Modal size="xl" flush onclose={closeOverlay}>
	{#if res.loading && !w}
		<Notice kind="loading" text="Loading world…" />
	{:else if res.error}
		<Notice kind="error" text={res.error} onretry={() => res.load(request.accountId)} />
	{:else if w}
		<Hero bg={w.imageUrl || w.thumbnailUrl} {accountId}>
			<Avatar src={w.thumbnailUrl || w.imageUrl} name={w.name} size={88} {accountId} square />
			<div class="who">
				<h2>{w.name || worldId}</h2>
				<div class="muted">by {w.authorName || w.authorId || 'unknown'}</div>
				<div class="stats">
					<span title="Players"><Icon name="users" /> {comma(w.occupants)}</span>
					<span title="Favorites"><Icon name="star" /> {comma(w.favorites)}</span>
					<span title="Visits"><Icon name="eye" /> {comma(w.visits)}</span>
					{#if w.releaseStatus && w.releaseStatus !== 'public'}<span class="badge warn">{w.releaseStatus}</span>{/if}
				</div>
			</div>
		</Hero>

		<div class="bar">
			<button class="btn sm" disabled={!accountId} onclick={() => (favOpen = true)}><Icon name="star" /> Favorite</button>
			<button class="btn ghost sm" onclick={() => copyText(worldId, 'world ID')}><Icon name="copy" /> ID</button>
			<button class="btn ghost sm" onclick={() => copyText(w.name, 'world name')}><Icon name="copy" /> Name</button>
			<button class="btn ghost sm" onclick={() => copyText(`https://vrchat.com/home/world/${worldId}`, 'link')}><Icon name="copy" /> Link</button>
			<a class="btn ghost sm" target="_blank" rel="noreferrer" href="https://vrchat.com/home/world/{worldId}"><Icon name="globe" /> Website</a>
			<span class="spacer"></span>
			{#if $loggedInAccounts.length > 1}
				<select class="acc-select" bind:value={accountId} title="Account used to invite / create instances / favorite">
					{#each $loggedInAccounts as a (a.id)}<option value={a.id}>As {accountLabel(a)}</option>{/each}
				</select>
			{/if}
		</div>

		<div class="tabbar"><Tabs {tabs} bind:value={tab} /></div>

		<div class="pane">
			{#if tab === 'instances'}
				{#if instances.length === 0}
					<Notice text="No visible instances right now. Use the Create instance tab to open one." />
				{:else}
					<ul class="insts">
						{#each instances as inst (inst.instanceId)}
							{@const loc = fullLocation(inst)}
							{@const d = describeLocation(loc)}
							<li class:featured={inst.featured}>
								<div class="main">
									<div class="line">
										{#if inst.featured}<span class="badge accent">This one</span>{/if}
										<span class="iid mono">{String(inst.instanceId).split('~')[0]}</span>
										<AccessBadge place={d} showPublic />
									</div>
									{#if inst.users?.length}
										<div class="faint small ellipsis">Friends: {inst.users.join(', ')}</div>
									{/if}
								</div>
								{#if inst.occupants}
									<span class="occ" title="Players"><Icon name="users" /> {inst.occupants}{inst.capacity ? `/${inst.capacity}` : ''}</span>
								{/if}
								<div class="acts">
									<button class="btn ghost icon sm" title="Invite myself (works for every access type)" disabled={!accountId || busyLoc === loc} onclick={() => inviteSelf(loc)}>
										{#if busyLoc === loc}…{:else}<Icon name="mail" />{/if}
									</button>
									<button class="btn ghost icon sm" title="Invite friends" disabled={!accountId} onclick={() => (inviteTarget = loc)}><Icon name="users" /></button>
									{#if inst.ownerUserId && d.accessType !== 'public'}
										<button class="btn ghost icon sm" title="Ask the owner for an invite" disabled={!accountId} onclick={() => requestInvite(accountId, inst.ownerUserId)}><Icon name="hand" /></button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if tab === 'create'}
				<div class="stack create">
					<p class="muted small">Open a new instance of this world; afterwards invite yourself into it.</p>
					<label class="field">
						<span class="lbl">Access type</span>
						<select bind:value={access}>
							{#each ACCESS as [v, label] (v)}<option value={v}>{label}</option>{/each}
						</select>
					</label>
					<label class="field">
						<span class="lbl">Region</span>
						<select bind:value={region}>
							<option value="us">US West</option>
							<option value="use">US East</option>
							<option value="eu">Europe</option>
							<option value="jp">Japan</option>
						</select>
					</label>
					<div class="row">
						<button class="btn primary" disabled={creating || !accountId} onclick={create}>{creating ? 'Creating…' : 'Create instance'}</button>
						{#if created?.location}
							<button class="btn" disabled={busyLoc === created.location} onclick={() => inviteSelf(created.location)}><Icon name="mail" /> Invite myself</button>
						{/if}
					</div>
					{#if created?.location}<div class="faint small mono">{shortId(created.location)}</div>{/if}
					{#if !accountId}<div class="error-text small">No logged-in account</div>{/if}
				</div>
			{:else}
				<Facts min={170}>
					<Fact label="Players">
						{comma(w.occupants)}
						{#if w.publicOccupants != null && w.privateOccupants != null}
							<span class="faint small">(public {comma(w.publicOccupants)} / private {comma(w.privateOccupants)})</span>
						{/if}
					</Fact>
					<Fact label="Favorites">
						{comma(w.favorites)}
						{#if w.favorites && w.visits}<span class="faint small">({Math.round((w.favorites / w.visits) * 100)}%)</span>{/if}
					</Fact>
					<Fact label="Visits">{comma(w.visits)}</Fact>
					<Fact label="Capacity">
						{comma(w.recommendedCapacity)} <span class="faint small">recommended</span>
						{#if w.capacity != null && w.capacity !== w.recommendedCapacity}<span class="faint small">/ {comma(w.capacity)} max</span>{/if}
					</Fact>
					<Fact label="Created">{formatDateTime(w.created_at) || '?'}</Fact>
					<Fact label="Updated">{formatDateTime(w.updated_at) || '?'}</Fact>
				</Facts>

				{#if w.description}
					<Block title="Description"><p class="desc">{w.description}</p></Block>
				{/if}
				{#if otherTags.length || authorTags.length}
					<Block title="Tags">
						<div class="tags">
							{#each otherTags as t (t)}<span class="badge">{t}</span>{/each}
							{#each authorTags as t (t)}<span class="badge accent">{prettyTag(t)}</span>{/each}
						</div>
					</Block>
				{/if}
				{#if w.previewYoutubeId}
					<Block title="Preview video">
						<a href="https://www.youtube.com/watch?v={w.previewYoutubeId}" target="_blank" rel="noreferrer">youtube.com/watch?v={w.previewYoutubeId}</a>
					</Block>
				{/if}
				{#if w.allowedDomains?.length}
					<Block title="Allowed domains">
						<div class="tags">{#each w.allowedDomains as d (d)}<span class="badge">{d}</span>{/each}</div>
					</Block>
				{/if}
				{#if packages.length}
					<Block title="Unity packages">
						<div class="tags">
							{#each packages as p (p.platform + p.unityVersion)}<span class="badge">{p.platform} · {p.unityVersion}</span>{/each}
						</div>
					</Block>
				{/if}
				<Block title="ID"><code class="mono">{worldId}</code></Block>
			{/if}
		</div>
	{/if}
</Modal>

<VrcFavoriteDialog bind:open={favOpen} {accountId} kind="world" objectId={worldId} title="VRChat world favorites" />
{#if inviteTarget}
	<InviteFriendsDialog {accountId} location={inviteTarget} onclose={() => (inviteTarget = null)} />
{/if}

<style>
	.who {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	h2 {
		font-size: 22px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 14px;
		margin-top: 4px;
		font-size: 13px;
		color: var(--text-dim);
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
	.tabbar {
		padding: 0 12px;
		border-bottom: 1px solid var(--border);
	}
	.tabbar :global(.tabs) {
		border-bottom: 0;
	}
	.pane {
		padding: 16px 20px 20px;
	}
	.insts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.insts li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px 8px 14px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--r);
	}
	.main {
		flex: 1;
		min-width: 0;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.iid {
		font-weight: 600;
	}
	.occ {
		font-size: 12.5px;
		color: var(--text-dim);
		white-space: nowrap;
	}
	.acts {
		display: flex;
		gap: 2px;
	}
	.create {
		max-width: 360px;
	}
	.desc {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.insts li.featured {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
</style>
