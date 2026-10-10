<script>
	import Icon from '$lib/components/ui/Icon.svelte';
	import { filteredFeed } from '$lib/stores/feed.js';
	import { accounts, accountsLoaded } from '$lib/stores/accounts.js';
	import { connecting } from '$lib/stores/connecting.js';
	import { settings } from '$lib/stores/settings.js';
	import { addAccountOpen } from '$lib/stores/overlay.js';
	import FeedToolbar from '$lib/components/feed/FeedToolbar.svelte';
	import FeedItem from '$lib/components/feed/FeedItem.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';

	const PAGE = 150;
	let limit = $state(PAGE);

	const compact = $derived($settings['ui.feedMode'] === 'compact');
	const shown = $derived($filteredFeed.slice(0, limit));

	/** "Today" / "Yesterday" / "Mon, Oct 5" for a feed entry's local date */
	function dayLabel(iso) {
		const d = new Date(iso);
		const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const diff = Math.round((start(new Date()) - start(d)) / 86400000);
		if (diff === 0) return 'Today';
		if (diff === 1) return 'Yesterday';
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(diff > 300 ? { year: 'numeric' } : {}) });
	}
	/** entries interleaved with a header whenever the day changes */
	const rows = $derived.by(() => {
		const out = [];
		let last = '';
		for (const entry of shown) {
			const label = dayLabel(entry.created_at);
			if (label !== last) out.push({ day: label, key: `day:${label}:${entry.id}` });
			last = label;
			out.push({ entry, key: entry.id });
		}
		return out;
	});
</script>

<svelte:head>
	<title>Feed · vrcx-ng</title>
</svelte:head>

<div class="feed-page">
	<FeedToolbar />
	<div class="scroll">
		<div class="col">
		{#if $filteredFeed.length === 0}
			{#if $accountsLoaded && $accounts.length === 0}
				<Notice icon="key" text="Add and log in to a VRChat account; friends coming online, going offline, changing worlds, avatars or status will show up here live." />
				<button class="btn primary add" onclick={() => addAccountOpen.set(true)}><Icon name="plus" /> Add account</button>
			{:else if $connecting}
				<Notice kind="loading" text="Connecting to your accounts…" />
			{:else}
				<Notice icon="radio" text="No matching feed entries yet" />
			{/if}
		{:else}
			{#each rows as r (r.key)}
				{#if r.day}
					<div class="day">{r.day}</div>
				{:else}
					<FeedItem entry={r.entry} {compact} />
				{/if}
			{/each}
			{#if $filteredFeed.length > limit}
				<button class="btn more" onclick={() => (limit += PAGE)}>Show more ({$filteredFeed.length - limit} left)</button>
			{/if}
		{/if}
		</div>
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
	.col {
		max-width: 860px;
		margin: 0 auto;
		min-height: 100%;
	}
	/* sticky day headers */
	.day {
		position: sticky;
		top: 0;
		z-index: 2;
		padding: 14px 20px 6px;
		font-size: 11.5px;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
		background: color-mix(in srgb, var(--bg-0) 88%, transparent);
		backdrop-filter: blur(6px);
	}
	.add,
	.more {
		display: block;
		margin: 16px auto;
	}
</style>
