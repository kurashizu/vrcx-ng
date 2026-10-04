<script>
	import { untrack } from 'svelte';
	import { closeOverlay, openUser } from '$lib/stores/overlay.js';
	import { accountById, accountLabel } from '$lib/stores/accounts.js';
	import { api, run } from '$lib/client/api.js';
	import { copyText } from '$lib/client/actions.js';
	import { createResource } from '$lib/client/resource.svelte.js';
	import { formatDateTime, tagList, prettyTag } from '$lib/shared/format.js';
	import { platformLabel } from '$lib/shared/presence.js';
	import Modal from '../ui/Modal.svelte';
	import Hero from '../ui/Hero.svelte';
	import Avatar from '../ui/Avatar.svelte';
	import Block from '../ui/Block.svelte';
	import Facts from '../ui/Facts.svelte';
	import Fact from '../ui/Fact.svelte';
	import Notice from '../ui/Notice.svelte';
	import VrcFavoriteDialog from './VrcFavoriteDialog.svelte';

	/** @type {{ request: { avatarId: string, accountId: string } }} */
	let { request } = $props();

	const avatarId = untrack(() => request.avatarId);
	let accountId = $state(untrack(() => request.accountId));

	const RATING = { Excellent: '极佳', Good: '良好', Medium: '中等', Poor: '较差', VeryPoor: '很差' };
	const RELEASE = { public: '公开', private: '私有' };

	const res = createResource(() => api(`/api/avatars/${encodeURIComponent(avatarId)}`));
	$effect(() => {
		untrack(() => res.load());
	});
	// default to an account that is allowed to wear it
	$effect(() => {
		const list = res.data?.selectableAccounts;
		if (list?.length && !list.some((a) => a.id === accountId)) accountId = list[0].id;
	});

	const av = $derived(res.data?.avatar);
	const tags = $derived(tagList(av?.tags));
	const authorTags = $derived(tags.filter((t) => t.startsWith('author_tag')));
	const contentTags = $derived(tags.filter((t) => t.startsWith('content_')));
	const otherTags = $derived(tags.filter((t) => !t.startsWith('author_tag') && !t.startsWith('content_')));
	const styles = $derived([av?.styles?.primary, av?.styles?.secondary].filter(Boolean));

	let wearing = $state(false);
	async function wear() {
		wearing = true;
		await run(() => api(`/api/avatars/${encodeURIComponent(avatarId)}/actions`, { method: 'POST', body: { action: 'select', accountId } }), '已换上这个模型');
		wearing = false;
	}

	let favOpen = $state(false);
	const size = (b) => (b ? `${(b / 1024 / 1024).toFixed(1)} MB` : '');
</script>

<Modal size="md" flush onclose={closeOverlay}>
	{#if res.loading && !av}
		<Notice kind="loading" text="加载模型详情…" />
	{:else if res.error}
		<Notice kind="error" text={res.error} onretry={() => res.load()} />
	{:else if av}
		<Hero bg={av.imageUrl || av.thumbnailImageUrl} {accountId}>
			<Avatar src={av.thumbnailImageUrl || av.imageUrl} name={av.name} size={96} {accountId} square />
			<div class="who">
				<h2>{av.name}</h2>
				<div class="muted">
					by <button class="author" onclick={() => openUser(av.authorId, { accountId })}>{av.authorName || av.authorId}</button>
				</div>
				<div class="badges">
					<span class="badge" class:warn={av.releaseStatus !== 'public'}>{RELEASE[av.releaseStatus] || av.releaseStatus || '?'}</span>
					{#each av.unityPackages || [] as p, i (i)}
						<span class="badge accent">
							{platformLabel(p.platform)}{#if p.performanceRating} · {RATING[p.performanceRating] || p.performanceRating}{/if}{#if p.fileSizeInBytes} · {size(p.fileSizeInBytes)}{/if}
						</span>
					{/each}
					{#if av.featured}<span class="badge warn">🔥 精选</span>{/if}
				</div>
			</div>
		</Hero>

		<div class="bar">
			<button class="btn primary sm" disabled={wearing || !accountId} onclick={wear}>{wearing ? '切换中…' : '🎭 换装'}</button>
			{#if res.data.selectableAccounts?.length > 1}
				<select class="acc-select" bind:value={accountId} title="用哪个账号换装 / 收藏">
					{#each res.data.selectableAccounts as a (a.id)}<option value={a.id}>{accountLabel($accountById.get(a.id) || a)}</option>{/each}
				</select>
			{/if}
			<button class="btn sm" disabled={!accountId} onclick={() => (favOpen = true)}>⭐ 收藏</button>
			<button class="btn ghost sm" onclick={() => copyText(av.id, '模型 ID')}>📋 ID</button>
			<button class="btn ghost sm" onclick={() => copyText(av.name, '模型名')}>📋 名字</button>
		</div>

		<div class="pane">
			{#if av.description}<Block><p class="desc">{av.description}</p></Block>{/if}
			{#if styles.length || tags.length}
				<Block title="标签">
					<div class="tags">
						{#each styles as s (s)}<span class="badge accent">🎨 {s}</span>{/each}
						{#each contentTags as t (t)}<span class="badge warn">{prettyTag(t)}</span>{/each}
						{#each authorTags as t (t)}<span class="badge accent">{prettyTag(t)}</span>{/each}
						{#each otherTags as t (t)}<span class="badge">{t}</span>{/each}
					</div>
				</Block>
			{/if}
			<Block title="信息">
				<Facts min={180}>
					<Fact label="版本">{av.version ?? '—'}</Fact>
					<Fact label="创建">{formatDateTime(av.created_at) || '—'}</Fact>
					<Fact label="更新">{formatDateTime(av.updated_at) || '—'}</Fact>
					<Fact label="ID" wide><code class="mono">{av.id}</code></Fact>
				</Facts>
			</Block>
		</div>
	{/if}
</Modal>

<VrcFavoriteDialog bind:open={favOpen} {accountId} kind="avatar" objectId={avatarId} title="VRChat 模型收藏" />

<style>
	.who {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	h2 {
		font-size: 20px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.author {
		color: var(--link);
	}
	.author:hover {
		text-decoration: underline;
	}
	.badges,
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.badges {
		margin-top: 4px;
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
		max-width: 180px;
		padding: 3px 8px;
		font-size: 12px;
	}
	.pane {
		padding: 16px 20px 20px;
	}
	.desc {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
