<script>
	import {
		feedTypes,
		typeFilter,
		searchText,
		paused,
		clearFeed
	} from '$lib/stores/feed.js';

	/** @type {'list'|'bubbles'} */
	let { mode = $bindable('list'), onModeChange } = $props();

	function setMode(m) {
		mode = m;
		onModeChange?.(m);
	}

	function toggleType(t) {
		typeFilter.update((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));
	}

	function clearTypes() {
		typeFilter.set([]);
	}
</script>

<div class="filter-bar">
	<div class="row">
		<input
			type="search"
			placeholder="搜索用户、世界、状态、模型…"
			bind:value={$searchText}
			class="search"
		/>
		<button
			class="ghost small"
			class:active={$paused}
			onclick={() => paused.update((p) => !p)}
			title="暂停/继续接收新事件"
		>
			{$paused ? '▶ 继续' : '⏸ 暂停'}
		</button>
		<button class="ghost small" onclick={clearFeed} title="清空 feed">🗑</button>
		<span class="mode-sep"></span>
		<button
			class="ghost small"
			class:active={mode === 'list'}
			onclick={() => setMode('list')}
			title="传统列表模式"
		>
			☰ 列表
		</button>
		<button
			class="ghost small"
			class:active={mode === 'bubbles'}
			onclick={() => setMode('bubbles')}
			title="大气泡 flex 模式"
		>
			▦ 气泡
		</button>
	</div>

	<div class="types">
		<button
			class="chip"
			class:on={$typeFilter.length === 0}
			onclick={clearTypes}
			title="清除类型过滤"
		>
			全部类型
		</button>
		{#each feedTypes as t}
			<button
				class="chip"
				class:on={$typeFilter.includes(t)}
				onclick={() => toggleType(t)}
			>
				{t}
			</button>
		{/each}
	</div>
</div>

<style>
	.filter-bar {
		padding: 10px 14px;
		background: var(--bg-1);
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.search {
		flex: 1;
	}
	.mode-sep {
		width: 1px;
		height: 16px;
		background: var(--border);
		margin: 0 2px;
	}
	.types,
	.account-filter {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		align-items: center;
	}
	.lbl {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		margin-right: 4px;
	}
	.chip {
		padding: 3px 9px;
		font-size: 11px;
		border-radius: 999px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		color: var(--text-dim);
	}
	.chip:hover {
		background: var(--bg-3);
		color: var(--text);
	}
	.chip.on {
		background: rgba(124, 92, 255, 0.18);
		color: #c8b8ff;
		border-color: rgba(124, 92, 255, 0.45);
	}
	button.active {
		background: var(--warn);
		color: #1a1a1a;
		border-color: var(--warn);
	}
	button.small {
		padding: 4px 10px;
		font-size: 12px;
	}
</style>
