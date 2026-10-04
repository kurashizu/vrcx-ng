<script>
	import { untrack } from 'svelte';
	import { accountLabel, loggedInAccounts } from '$lib/stores/accounts.js';
	import { closeOverlay } from '$lib/stores/overlay.js';
	import { api, run, accountPath } from '$lib/client/api.js';
	import { copyText, launchInstance, selfInvite, requestInvite } from '$lib/client/actions.js';
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

	/** @type {{ request: { worldId: string, accountId: string } }} */
	let { request } = $props();

	const worldId = untrack(() => request.worldId);
	/** the account that invites / creates instances / favorites */
	let accountId = $state(untrack(() => request.accountId));
	let tab = $state('instances');

	const res = createResource((aid) => api(`/api/worlds/${encodeURIComponent(worldId)}`, { query: { accountId: aid } }));
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
		{ id: 'instances', label: '实例', count: instances.length },
		{ id: 'create', label: '创建实例' },
		{ id: 'info', label: '详情' }
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
		['public', '公开'],
		['friends', '仅好友'],
		['friends+', '好友+'],
		['invite', '仅邀请'],
		['invite+', '邀请+（可申请）']
	];
	const API_TYPE = { public: 'public', friends: 'friends', 'friends+': 'hidden', invite: 'private', 'invite+': 'private' };
	let access = $state('public');
	let region = $state('us');
	let creating = $state(false);
	let created = $state(/** @type {any} */ (null));

	async function create() {
		creating = true;
		const body = { action: 'createInstance', worldId, type: API_TYPE[access], canRequestInvite: access === 'invite+', region };
		const r = await run(() => api(`${accountPath(accountId)}/instance-action`, { method: 'POST', body }), '实例已创建');
		creating = false;
		if (r) created = r.instance;
	}
</script>

<Modal size="xl" flush onclose={closeOverlay}>
	{#if res.loading && !w}
		<Notice kind="loading" text="加载世界详情…" />
	{:else if res.error}
		<Notice kind="error" text={res.error} onretry={() => res.load(request.accountId)} />
	{:else if w}
		<Hero bg={w.imageUrl || w.thumbnailUrl} {accountId}>
			<Avatar src={w.thumbnailUrl || w.imageUrl} name={w.name} size={88} {accountId} square />
			<div class="who">
				<h2>{w.name || worldId}</h2>
				<div class="muted">by {w.authorName || w.authorId || '未知'}</div>
				<div class="stats">
					<span title="当前人数">👥 {comma(w.occupants)}</span>
					<span title="收藏">⭐ {comma(w.favorites)}</span>
					<span title="访问">👁 {comma(w.visits)}</span>
					{#if w.releaseStatus && w.releaseStatus !== 'public'}<span class="badge warn">{w.releaseStatus}</span>{/if}
				</div>
			</div>
		</Hero>

		<div class="bar">
			<button class="btn primary sm" onclick={() => launchInstance(worldId)}>↗ 启动世界</button>
			<button class="btn sm" disabled={!accountId} onclick={() => (favOpen = true)}>⭐ 收藏</button>
			<button class="btn ghost sm" onclick={() => copyText(worldId, '世界 ID')}>📋 ID</button>
			<button class="btn ghost sm" onclick={() => copyText(w.name, '世界名')}>📋 名字</button>
			<button class="btn ghost sm" onclick={() => copyText(`https://vrchat.com/home/world/${worldId}`, '链接')}>📋 链接</button>
			<a class="btn ghost sm" target="_blank" rel="noreferrer" href="https://vrchat.com/home/world/{worldId}">🌐 网站</a>
			<span class="spacer"></span>
			{#if $loggedInAccounts.length > 1}
				<select class="acc-select" bind:value={accountId} title="用哪个账号邀请 / 创建实例 / 收藏">
					{#each $loggedInAccounts as a (a.id)}<option value={a.id}>以 {accountLabel(a)}</option>{/each}
				</select>
			{/if}
		</div>

		<div class="tabbar"><Tabs {tabs} bind:value={tab} /></div>

		<div class="pane">
			{#if tab === 'instances'}
				{#if instances.length === 0}
					<Notice text="暂时没有可见的实例。可以到「创建实例」开一个。" />
				{:else}
					<ul class="insts">
						{#each instances as inst (inst.instanceId)}
							{@const loc = fullLocation(inst)}
							{@const d = describeLocation(loc)}
							<li>
								<div class="main">
									<div class="line">
										<span class="iid mono">{String(inst.instanceId).split('~')[0]}</span>
										<AccessBadge place={d} showPublic />
									</div>
									{#if inst.users?.length}
										<div class="faint small ellipsis">好友：{inst.users.join('、')}</div>
									{/if}
								</div>
								{#if inst.occupants}
									<span class="occ" title="人数">👥 {inst.occupants}{inst.capacity ? `/${inst.capacity}` : ''}</span>
								{/if}
								<div class="acts">
									<button class="btn ghost icon sm" title="邀请自己（所有访问类型都可以）" disabled={!accountId || busyLoc === loc} onclick={() => inviteSelf(loc)}>
										{busyLoc === loc ? '…' : '✉️'}
									</button>
									<button class="btn ghost icon sm" title="邀请好友加入" disabled={!accountId} onclick={() => (inviteTarget = loc)}>👥</button>
									{#if inst.ownerUserId && d.accessType !== 'public'}
										<button class="btn ghost icon sm" title="向房主请求邀请" disabled={!accountId} onclick={() => requestInvite(accountId, inst.ownerUserId)}>✋</button>
									{/if}
									<button class="btn ghost icon sm" title="用 VRChat 打开" onclick={() => launchInstance(loc)}>↗</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if tab === 'create'}
				<div class="stack create">
					<p class="muted small">在这个世界新开一个实例；创建后可以邀请自己进入，或直接启动。</p>
					<label class="field">
						<span class="lbl">访问类型</span>
						<select bind:value={access}>
							{#each ACCESS as [v, label] (v)}<option value={v}>{label}</option>{/each}
						</select>
					</label>
					<label class="field">
						<span class="lbl">区域</span>
						<select bind:value={region}>
							<option value="us">US West</option>
							<option value="use">US East</option>
							<option value="eu">Europe</option>
							<option value="jp">Japan</option>
						</select>
					</label>
					<div class="row">
						<button class="btn primary" disabled={creating || !accountId} onclick={create}>{creating ? '创建中…' : '创建实例'}</button>
						{#if created?.location}
							<button class="btn" disabled={busyLoc === created.location} onclick={() => inviteSelf(created.location)}>✉️ 邀请自己</button>
							<button class="btn" onclick={() => launchInstance(created.location)}>↗ 启动</button>
						{/if}
					</div>
					{#if created?.location}<div class="faint small mono">{shortId(created.location)}</div>{/if}
					{#if !accountId}<div class="error-text small">没有已登录的账号</div>{/if}
				</div>
			{:else}
				<Facts min={170}>
					<Fact label="当前人数">
						{comma(w.occupants)}
						{#if w.publicOccupants != null && w.privateOccupants != null}
							<span class="faint small">（公开 {comma(w.publicOccupants)} / 私人 {comma(w.privateOccupants)}）</span>
						{/if}
					</Fact>
					<Fact label="收藏">
						{comma(w.favorites)}
						{#if w.favorites && w.visits}<span class="faint small">（{Math.round((w.favorites / w.visits) * 100)}%）</span>{/if}
					</Fact>
					<Fact label="访问">{comma(w.visits)}</Fact>
					<Fact label="容量">
						{comma(w.recommendedCapacity)} <span class="faint small">推荐</span>
						{#if w.capacity != null && w.capacity !== w.recommendedCapacity}<span class="faint small">/ {comma(w.capacity)} 最大</span>{/if}
					</Fact>
					<Fact label="创建">{formatDateTime(w.created_at) || '?'}</Fact>
					<Fact label="更新">{formatDateTime(w.updated_at) || '?'}</Fact>
				</Facts>

				{#if w.description}
					<Block title="描述"><p class="desc">{w.description}</p></Block>
				{/if}
				{#if otherTags.length || authorTags.length}
					<Block title="标签">
						<div class="tags">
							{#each otherTags as t (t)}<span class="badge">{t}</span>{/each}
							{#each authorTags as t (t)}<span class="badge accent">{prettyTag(t)}</span>{/each}
						</div>
					</Block>
				{/if}
				{#if w.previewYoutubeId}
					<Block title="预览视频">
						<a href="https://www.youtube.com/watch?v={w.previewYoutubeId}" target="_blank" rel="noreferrer">youtube.com/watch?v={w.previewYoutubeId}</a>
					</Block>
				{/if}
				{#if w.allowedDomains?.length}
					<Block title="允许的域名">
						<div class="tags">{#each w.allowedDomains as d (d)}<span class="badge">{d}</span>{/each}</div>
					</Block>
				{/if}
				{#if packages.length}
					<Block title="Unity 包">
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

<VrcFavoriteDialog bind:open={favOpen} {accountId} kind="world" objectId={worldId} title="VRChat 世界收藏" />
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
</style>
