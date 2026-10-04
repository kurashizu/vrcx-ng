<script>
	import { FEED_TYPES, feedMeta } from '$lib/shared/feed.js';
	import { typeFilter, searchText, paused, heldCount, clearFeed, accountFilter } from '$lib/stores/feed.js';
	import { accountById, accountLabel } from '$lib/stores/accounts.js';
	import { settings, updateSetting } from '$lib/stores/settings.js';
	import { askConfirm } from '$lib/stores/overlay.js';

	const cards = $derived(($settings['ui.feedMode'] || 'bubbles') === 'bubbles');

	const toggleType = (t) => typeFilter.update((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));

	async function clear() {
		if (await askConfirm('清空当前显示的动态？（已保存的历史不受影响，刷新后会重新载入）', { okLabel: '清空', danger: true })) clearFeed();
	}
</script>

<div class="bar">
	<div class="row">
		<input type="search" placeholder="搜索用户、世界、状态、模型…" bind:value={$searchText} />
		{#if $accountFilter}
			<button class="chip on" title="取消账号筛选" onclick={() => accountFilter.set(null)}>
				{accountLabel($accountById.get($accountFilter)) || '账号'} ✕
			</button>
		{/if}
		<button class="btn sm" class:primary={$paused} onclick={() => paused.update((p) => !p)} title="暂停后新动态先暂存，继续时一并显示">
			{$paused ? `▶ 继续${$heldCount ? ` (${$heldCount})` : ''}` : '⏸ 暂停'}
		</button>
		<button class="btn ghost sm icon" onclick={clear} title="清空显示">🗑</button>
		<div class="seg">
			<button class:on={!cards} title="列表" onclick={() => updateSetting('ui.feedMode', 'list')}>☰</button>
			<button class:on={cards} title="卡片" onclick={() => updateSetting('ui.feedMode', 'bubbles')}>▦</button>
		</div>
	</div>
	<div class="types">
		<button class="chip" class:on={$typeFilter.length === 0} onclick={() => typeFilter.set([])}>默认</button>
		{#each FEED_TYPES as t (t)}
			<button class="chip" class:on={$typeFilter.includes(t)} onclick={() => toggleType(t)}>{feedMeta(t).icon} {feedMeta(t).label}</button>
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
