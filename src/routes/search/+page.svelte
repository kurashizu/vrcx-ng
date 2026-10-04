<script>
	import { onMount } from 'svelte';
	import { openUser, openWorld, openAvatar } from '$lib/stores/overlay.js';
	import { accountById, accountLabel } from '$lib/stores/accounts.js';
	import { api } from '$lib/client/api.js';
	import { comma, timeAgo, clip } from '$lib/shared/format.js';
	import { now } from '$lib/stores/clock.js';
	import Page from '$lib/components/ui/Page.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import ListRow from '$lib/components/ui/ListRow.svelte';
	import UserName from '$lib/components/ui/UserName.svelte';
	import StatusPill from '$lib/components/ui/StatusPill.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';

	const TYPES = [
		{ id: 'friends', icon: '👥', label: '我的好友' },
		{ id: 'users', icon: '👤', label: '用户' },
		{ id: 'worlds', icon: '🌍', label: '世界' },
		{ id: 'avatars', icon: '🎭', label: '模型' }
	];
	const HINT = { friends: '本地缓存，覆盖所有账号，不走 VRChat API', users: '通过 VRChat API 搜索', worlds: '通过 VRChat API 搜索', avatars: '通过 VRChat API 搜索' };

	let query = $state('');
	let type = $state('friends');
	let input = $state(/** @type {HTMLInputElement | undefined} */ (undefined));
	onMount(() => input?.focus());
	let busy = $state(false);
	let error = $state('');
	let results = $state(/** @type {any[]} */ ([]));
	/** the type the current `results` belong to (the tab may already have moved on) */
	let resultType = $state('friends');

	let seq = 0;
	// debounced search on every keystroke / tab change
	$effect(() => {
		const q = query.trim();
		const t = type;
		if (q.length < 2) {
			results = [];
			error = '';
			busy = false;
			return;
		}
		const timer = setTimeout(() => search(q, t), t === 'friends' ? 120 : 350);
		return () => clearTimeout(timer);
	});

	async function search(q, t) {
		const mine = ++seq;
		busy = true;
		error = '';
		try {
			const j = await api('/api/search', { query: { q, type: t, n: 24 } });
			if (mine !== seq) return;
			results = j.results || [];
			resultType = t;
		} catch (err) {
			if (mine !== seq) return;
			error = err.message;
			results = [];
		} finally {
			if (mine === seq) busy = false;
		}
	}
</script>

<Page title="搜索" icon="🔍" width="normal">
	<div class="stack">
		<div class="box">
			<input type="search" bind:this={input} bind:value={query} enterkeyhint="search" placeholder={type === 'friends' ? '搜索好友名字 / ID / 备注…' : '输入关键词…'} />
			{#if busy}<span class="spinner"></span>{/if}
		</div>
		<Tabs variant="pill" bind:value={type} tabs={TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))} />
		<div class="faint small">{HINT[type]}</div>
	</div>

	{#if error}
		<Notice kind="error" text={error} />
	{:else if query.trim().length < 2}
		<Notice text="至少输入 2 个字符开始搜索" />
	{:else if busy && !results.length}
		<Notice kind="loading" text="搜索中…" />
	{:else if !results.length}
		<Notice text="没有匹配的结果" />
	{:else}
		<div class="faint small">{results.length} 条结果</div>
		<div class="list">
			{#each results as r (r.userId || r.id)}
				{#if resultType === 'friends'}
					<ListRow
						thumb={r.userThumbnailUrl}
						name={r.displayName}
						accountId={r.accountId}
						presence={r.state}
						status={r.status}
						onclick={() => openUser(r.userId, { accountId: r.accountIds?.[0] })}
					>
						{#snippet title()}
							<UserName user={r} />
							<StatusPill status={r.status} />
						{/snippet}
						{#snippet meta()}
							<span class="mono">{r.userId}</span>
							{#if r.note}<span>备注：{r.note}</span>{/if}
							{#if r.location && r.location !== 'offline' && r.worldName}<span>📍 {r.worldName}</span>{/if}
							{#if r.lastSeen}<span>{timeAgo(r.lastSeen, $now)}</span>{/if}
						{/snippet}
						{#snippet trailing()}
							{#each (r.accountIds || []).slice(0, 3) as aid (aid)}
								<Avatar name={accountLabel($accountById.get(aid))} size={22} />
							{/each}
							{#if (r.accountIds || []).length > 3}<span class="faint small">+{r.accountIds.length - 3}</span>{/if}
						{/snippet}
					</ListRow>
				{:else if resultType === 'users'}
					<ListRow thumb={r.currentAvatarThumbnailImageUrl || `https://api.vrchat.cloud/api/1/image/${r.id}/1/256.jpg`} name={r.displayName} accountId={r.accountId} onclick={() => openUser(r.id)}>
						{#snippet title()}
							<UserName user={r} />
							<StatusPill status={r.status} />
							{#if r.developerType && r.developerType !== 'none'}<span class="badge warn">{r.developerType}</span>{/if}
						{/snippet}
						{#snippet meta()}
							<span class="mono">{r.id}</span>
							{#if r.bio}<span>{clip(r.bio, 80)}</span>{/if}
							{#if r.last_login}<span>{timeAgo(r.last_login, $now)}上线</span>{/if}
						{/snippet}
					</ListRow>
				{:else if resultType === 'worlds'}
					<ListRow thumb={r.imageUrl || r.thumbnailImageUrl} name={r.name} accountId={r.accountId} square onclick={() => openWorld(r.id)}>
						{#snippet title()}
							{r.name}
							{#if r.releaseStatus && r.releaseStatus !== 'public'}<span class="badge warn">{r.releaseStatus}</span>{/if}
						{/snippet}
						{#snippet meta()}
							<span>by {r.authorName || r.authorId || '?'}</span>
							<span>👥 {comma(r.occupants || 0)}{r.capacity ? `/${r.capacity}` : ''}</span>
							<span>⭐ {comma(r.favorites || 0)}</span>
							<span>👁 {comma(r.visits || 0)}</span>
						{/snippet}
					</ListRow>
				{:else}
					<ListRow thumb={r.thumbnailImageUrl || r.imageUrl} name={r.name} accountId={r.accountId} square onclick={() => openAvatar(r.id)}>
						{#snippet title()}
							{r.name}
							{#if r.releaseStatus && r.releaseStatus !== 'public'}<span class="badge warn">{r.releaseStatus}</span>{/if}
						{/snippet}
						{#snippet meta()}
							<span>by {r.authorName || r.authorId || '?'}</span>
							{#if r.description}<span>{clip(r.description, 80)}</span>{/if}
						{/snippet}
					</ListRow>
				{/if}
			{/each}
		</div>
	{/if}
</Page>

<style>
	.box {
		position: relative;
	}
	.box input {
		padding: 11px 14px;
		font-size: 15px;
	}
	.box .spinner {
		position: absolute;
		right: 14px;
		top: 50%;
		margin-top: -9px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
