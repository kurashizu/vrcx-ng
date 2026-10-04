<script>
	import { filteredFeed } from '$lib/stores/feed.js';
	import { accounts, accountsLoaded } from '$lib/stores/accounts.js';
	import { settings } from '$lib/stores/settings.js';
	import { addAccountOpen } from '$lib/stores/overlay.js';
	import FeedToolbar from '$lib/components/feed/FeedToolbar.svelte';
	import FeedItem from '$lib/components/feed/FeedItem.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';

	const PAGE = 150;
	let limit = $state(PAGE);

	const cards = $derived(($settings['ui.feedMode'] || 'bubbles') === 'bubbles');
	const shown = $derived($filteredFeed.slice(0, limit));
</script>

<svelte:head>
	<title>动态 · vrcx-ng</title>
</svelte:head>

<div class="feed-page">
	<FeedToolbar />
	<div class="scroll" class:cards>
		{#if $filteredFeed.length === 0}
			{#if $accountsLoaded && $accounts.length === 0}
				<Notice icon="🔑" text="添加并登录 VRChat 账号后，好友的上线、离线、换世界、换模型、状态变化会实时出现在这里。" />
				<button class="btn primary add" onclick={() => addAccountOpen.set(true)}>＋ 添加账号</button>
			{:else}
				<Notice icon="📡" text="还没有符合条件的动态" />
			{/if}
		{:else}
			{#each shown as entry (entry.id)}
				<FeedItem {entry} {cards} />
			{/each}
			{#if $filteredFeed.length > limit}
				<button class="btn more" onclick={() => (limit += PAGE)}>显示更多（还有 {$filteredFeed.length - limit} 条）</button>
			{/if}
		{/if}
	</div>
</div>

<style>
	.feed-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.scroll.cards {
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 10px;
		padding: 14px 16px;
	}
	.add,
	.more {
		display: block;
		margin: 14px auto;
	}
	.cards .more {
		flex-basis: 100%;
	}
</style>
