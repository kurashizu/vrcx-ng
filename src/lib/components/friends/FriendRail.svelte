<script>
	import { onMount } from 'svelte';
	import { friendsData, friendGroups, loadFriendGroups } from '$lib/stores/friends.js';
	import { accounts, accountLabel } from '$lib/stores/accounts.js';
	import { settings } from '$lib/stores/settings.js';
	import { persisted } from '$lib/stores/persisted.js';
	import { matchFriend, sortFriends, byName, byLastSeen, groupByWorld, groupByFriendGroup, inSameInstance, SORTS } from '$lib/client/friends.js';
	import { describeLocation } from '$lib/shared/location.js';
	import { openWorld } from '$lib/stores/overlay.js';
	import { launchInstance } from '$lib/client/actions.js';
	import { STATUS_COLOR } from '$lib/shared/presence.js';
	import Section from '../ui/Section.svelte';
	import AccessBadge from '../ui/AccessBadge.svelte';
	import Notice from '../ui/Notice.svelte';
	import FriendRow from './FriendRow.svelte';

	const view = persisted('rail.view', 'smart'); // smart | flat | group
	const sortBy = persisted('rail.sortBy', 'displayName');
	const sortDir = persisted('rail.sortDir', 'asc');
	/** only explicitly collapsed sections are remembered */
	const collapsed = persisted('rail.collapsed', /** @type {Record<string, boolean>} */ ({ offline: true }));

	const VIEWS = [
		{ id: 'smart', icon: '🌍', label: '按世界分组' },
		{ id: 'flat', icon: '☰', label: '平铺' },
		{ id: 'group', icon: '🗂', label: '按分组' }
	];
	const STATUS_CHIPS = [
		{ id: '', label: '全部' },
		{ id: 'join me', label: '加入我' },
		{ id: 'active', label: '在线' },
		{ id: 'ask me', label: '询问我' },
		{ id: 'busy', label: '忙碌' }
	];
	const OFFLINE_CAP = 200;

	let query = $state('');
	let status = $state('');
	let accountId = $state('');
	let showAllOffline = $state(false);

	onMount(loadFriendGroups);

	const open = (key) => !$collapsed[key];
	function setOpen(key, isOpen) {
		const next = { ...$collapsed };
		if (isOpen) delete next[key];
		else next[key] = true;
		collapsed.set(next);
	}

	const q = $derived(query.trim().toLowerCase());
	const prep = (list) => list.filter((f) => matchFriend(f, q) && (!status || f.status === status) && (!accountId || f.accountIds.includes(accountId)));

	const online = $derived(sortFriends(prep($friendsData.online), $sortBy, $sortDir));
	const active = $derived(sortFriends(prep($friendsData.active), $sortBy, $sortDir));
	const offline = $derived(prep($friendsData.offline).sort($settings['friend.sortOfflineBy'] === 'name' ? byName : byLastSeen));

	// friends that are pinned above the world groups don't repeat below
	const sameInstance = $derived(inSameInstance(online, $friendsData.self));
	const vipGroups = $derived.by(() => {
		if ($view === 'group') return [];
		const visible = $friendGroups.groups.filter((g) => g.visible);
		const taken = new Set(sameInstance.map((f) => f.id));
		return groupByFriendGroup(
			online.filter((f) => !taken.has(f.id)),
			visible
		).filter((b) => b.key !== '_none');
	});
	const pinned = $derived(new Set([...sameInstance, ...vipGroups.flatMap((b) => b.friends)].map((f) => f.id)));
	const rest = $derived(online.filter((f) => !pinned.has(f.id)));

	const worlds = $derived($view === 'smart' ? groupByWorld(rest) : null);
	const groups = $derived($view === 'group' ? groupByFriendGroup(rest, $friendGroups.groups) : null);

	const joinMe = $derived($friendsData.online.filter((f) => f.status === 'join me').length);
	const nothing = $derived(!online.length && !active.length && !offline.length);

</script>

{#snippet people(list, place = 'full')}
	{#each list as f (f.id)}
		<FriendRow friend={f} {place} />
	{/each}
{/snippet}

<div class="rail">
	<header>
		<div class="title">
			<h2>好友</h2>
			<span class="total">{$friendsData.total}</span>
			<span class="live" title="在线 {$friendsData.online.length} · 加入我 {joinMe} · 离线 {$friendsData.offline.length}">
				<i style:--c="var(--online)"></i>{$friendsData.online.length}
				<i style:--c="var(--st-join)"></i>{joinMe}
			</span>
			<span class="spacer"></span>
			<a class="btn ghost icon sm" href="/friends" title="好友总览（网格）">⛶</a>
		</div>
		<input type="search" placeholder="搜索名字 / 世界 / ID…" bind:value={query} />
		<div class="chips">
			{#each STATUS_CHIPS as c (c.id)}
				<button class="chip" class:on={status === c.id} onclick={() => (status = c.id)}>
					{#if c.id}<i style:--c={STATUS_COLOR[c.id]}></i>{/if}{c.label}
				</button>
			{/each}
		</div>
		<div class="tools">
			<div class="seg">
				{#each VIEWS as v (v.id)}
					<button class:on={$view === v.id} title={v.label} onclick={() => view.set(v.id)}>{v.icon}</button>
				{/each}
			</div>
			<select bind:value={$sortBy} title="排序（在线 / 活跃好友）">
				{#each Object.entries(SORTS) as [id, s] (id)}
					<option value={id}>{s.label}</option>
				{/each}
			</select>
			<button class="btn ghost icon sm" title="排序方向" onclick={() => sortDir.set($sortDir === 'asc' ? 'desc' : 'asc')}>
				{$sortDir === 'asc' ? '↑' : '↓'}
			</button>
		</div>
		{#if $accounts.length > 1}
			<select bind:value={accountId}>
				<option value="">所有账号</option>
				{#each $accounts as a (a.id)}
					<option value={a.id}>{accountLabel(a)}</option>
				{/each}
			</select>
		{/if}
	</header>

	<div class="scroll">
		{#if sameInstance.length}
			<Section title="🧩 同实例" count={sameInstance.length} open={open('same')} ontoggle={(o) => setOpen('same', o)}>
				{@render people(sameInstance)}
			</Section>
		{/if}

		{#each vipGroups as g (g.key)}
			<Section title="⭐ {g.label}" count={g.friends.length} open={open(`vip:${g.key}`)} ontoggle={(o) => setOpen(`vip:${g.key}`, o)}>
				{@render people(g.friends)}
			</Section>
		{/each}

		{#if worlds}
			{#each worlds.worlds as w (w.key)}
				{@const single = w.instances.length === 1 ? describeLocation(w.instances[0].location) : null}
				<Section count={w.count} dot="var(--online)" open={open(`w:${w.key}`)} ontoggle={(o) => setOpen(`w:${w.key}`, o)}>
					{#snippet header()}
						<button class="world ellipsis" title={w.label} onclick={(e) => (e.stopPropagation(), openWorld(w.worldId))}>{w.label}</button>
						{#if single}<AccessBadge place={single} />{/if}
					{/snippet}
					{#snippet actions()}
						{#if single}
							<button class="go" title="加入该实例" onclick={(e) => (e.stopPropagation(), launchInstance(w.instances[0].location))}>↗</button>
						{/if}
					{/snippet}
					<!-- the header already names the world; with several instances each row says which one -->
					{#if single}
						{@render people(w.friends, 'none')}
					{:else}
						{@render people(w.instances.flatMap((i) => i.friends), 'access')}
					{/if}
				</Section>
			{/each}
			{#if worlds.traveling.length}
				<Section title="🧳 旅行中" count={worlds.traveling.length} open={open('traveling')} ontoggle={(o) => setOpen('traveling', o)}>
					{@render people(worlds.traveling, 'none')}
				</Section>
			{/if}
			{#if worlds.incognito.length}
				<Section title="🙈 隐身中" count={worlds.incognito.length} dot="var(--online)" open={open('incognito')} ontoggle={(o) => setOpen('incognito', o)}>
					{@render people(worlds.incognito, 'none')}
				</Section>
			{/if}
		{:else if groups}
			{#each groups as g (g.key)}
				<Section title={g.label} count={g.friends.length} dot={g.color || 'var(--online)'} open={open(`g:${g.key}`)} ontoggle={(o) => setOpen(`g:${g.key}`, o)}>
					{@render people(g.friends)}
				</Section>
			{/each}
		{:else if rest.length}
			<Section title="在线" count={rest.length} dot="var(--online)" open={open('online')} ontoggle={(o) => setOpen('online', o)}>
				{@render people(rest)}
			</Section>
		{/if}

		{#if active.length}
			<Section title="在线（未在游戏中）" count={active.length} dot="var(--active)" open={open('active')} ontoggle={(o) => setOpen('active', o)}>
				{@render people(active)}
			</Section>
		{/if}

		{#if offline.length}
			<Section title="离线" count={offline.length} dot="var(--offline)" open={open('offline')} ontoggle={(o) => setOpen('offline', o)}>
				{@render people(showAllOffline ? offline : offline.slice(0, OFFLINE_CAP))}
				{#if offline.length > OFFLINE_CAP && !showAllOffline}
					<button class="more" onclick={() => (showAllOffline = true)}>显示全部 {offline.length} 位离线好友</button>
				{/if}
			</Section>
		{/if}

		{#if $friendsData.total === 0}
			<Notice icon="👥" text="还没有好友数据。登录账号后会自动拉取。" />
		{:else if nothing}
			<Notice text="没有匹配的好友" />
		{/if}
	</div>
</div>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg-1);
		border-left: 1px solid var(--border);
	}
	header {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 12px 10px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	h2 {
		font-size: 15px;
		font-weight: 700;
	}
	.total {
		font-size: 12px;
		color: var(--text-faint);
	}
	.live {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	i {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
	}
	.live i:not(:first-child) {
		margin-left: 6px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.chips .chip {
		padding: 0 9px;
		font-size: 11.5px;
	}
	.tools {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.tools select {
		flex: 1;
		padding: 4px 8px;
		font-size: 12.5px;
	}
	.seg {
		display: flex;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--r);
		padding: 2px;
	}
	.seg button {
		width: 28px;
		height: 24px;
		border-radius: 6px;
		font-size: 13px;
		color: var(--text-dim);
	}
	.seg button.on {
		background: var(--accent-soft);
		color: var(--accent-ink);
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 0 24px;
	}
	.world {
		min-width: 0;
		text-align: left;
		font-weight: 650;
		color: var(--text);
	}
	.world:hover {
		color: var(--accent-ink);
		text-decoration: underline;
	}
	.go {
		width: 22px;
		height: 22px;
		border-radius: var(--r-sm);
		color: var(--text-dim);
	}
	.go:hover {
		background: var(--bg-3);
		color: var(--text);
	}
	.more {
		display: block;
		width: 100%;
		padding: 8px;
		font-size: 12px;
		color: var(--text-dim);
	}
	.more:hover {
		color: var(--text);
		background: var(--bg-2);
	}
</style>
