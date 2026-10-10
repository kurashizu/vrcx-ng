<script>
	import Icon from '../ui/Icon.svelte';
	import { FEED_TYPES, feedMeta } from '$lib/shared/feed.js';
	import { typeFilter, searchText, paused, heldCount, clearFeed, accountFilter } from '$lib/stores/feed.js';
	import { accountById, accountLabel } from '$lib/stores/accounts.js';
	import { settings, updateSetting } from '$lib/stores/settings.js';
	import { askConfirm } from '$lib/stores/overlay.js';

	const compact = $derived($settings['ui.feedMode'] === 'compact');

	const toggleType = (t) => typeFilter.update((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));

	async function clear() {
		if (await askConfirm('Clear the feed shown here? (Saved history is not affected and reloads on refresh.)', { okLabel: 'Clear', danger: true })) clearFeed();
	}
</script>

<div class="bar">
	<div class="row">
		<input type="search" placeholder="Search users, worlds, status, avatars…" bind:value={$searchText} />
		{#if $accountFilter}
			<button class="chip on" title="Clear account filter" onclick={() => accountFilter.set(null)}>
				{accountLabel($accountById.get($accountFilter)) || 'Account'} <Icon name="x" size="12px" />
			</button>
		{/if}
		<button class="btn sm" class:primary={$paused} onclick={() => paused.update((p) => !p)} title="While paused, new entries are held and shown on resume">
			{$paused ? `Resume${$heldCount ? ` (${$heldCount})` : ''}` : 'Pause'}
		</button>
		<button class="btn ghost sm icon" onclick={clear} title="Clear"><Icon name="trash" /></button>
		<div class="seg">
			<button class:on={!compact} title="Comfortable" aria-label="Comfortable" onclick={() => updateSetting('ui.feedMode', 'comfortable')}><Icon name="rows" /></button>
			<button class:on={compact} title="Compact" aria-label="Compact" onclick={() => updateSetting('ui.feedMode', 'compact')}><Icon name="menu" /></button>
		</div>
	</div>
	<div class="types">
		<button class="chip" class:on={$typeFilter.length === 0} onclick={() => typeFilter.set([])}>Default</button>
		{#each FEED_TYPES as t (t)}
			<button class="chip" class:on={$typeFilter.includes(t)} onclick={() => toggleType(t)}><Icon name={feedMeta(t).icon} /> {feedMeta(t).label}</button>
		{/each}
	</div>
</div>

<style>
	.bar {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 16px;
		background: var(--bg-1);
		border-bottom: 1px solid var(--border);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	input {
		flex: 1;
		min-width: 0;
	}
	.types {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.types .chip {
		font-size: 11.5px;
		padding: 0 9px;
	}
	.seg {
		display: flex;
		flex: none;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--r);
		padding: 2px;
	}
	.seg button {
		width: 30px;
		height: 26px;
		border-radius: 6px;
		color: var(--text-dim);
	}
	.seg button.on {
		background: var(--accent-soft);
		color: var(--accent-ink);
	}
</style>
