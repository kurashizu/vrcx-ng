<script>
	/**
	 * @type {{
	 *   tabs: { id: string, label: string, count?: number | null, icon?: string }[],
	 *   value: string,
	 *   onchange?: (id: string) => void,
	 *   variant?: 'line' | 'pill'
	 * }}
	 */
	let { tabs, value = $bindable(), onchange, variant = 'line' } = $props();
</script>

<div class="tabs {variant}" role="tablist">
	{#each tabs as t (t.id)}
		<button
			role="tab"
			class="tab"
			class:on={value === t.id}
			aria-selected={value === t.id}
			onclick={() => {
				value = t.id;
				onchange?.(t.id);
			}}
		>
			{#if t.icon}<span class="ico">{t.icon}</span>{/if}
			{t.label}
			{#if t.count != null}<span class="count">{t.count}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		gap: 2px;
		overflow-x: auto;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		color: var(--text-dim);
		white-space: nowrap;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 0.12s;
	}
	.tab:hover {
		color: var(--text);
	}
	.line {
		border-bottom: 1px solid var(--border);
	}
	.line .tab.on {
		color: var(--text);
		border-bottom-color: var(--accent);
		font-weight: 600;
	}
	.pill {
		gap: 4px;
	}
	.pill .tab {
		padding: 5px 12px;
		border: 0;
		margin: 0;
		border-radius: var(--r);
	}
	.pill .tab.on {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.count {
		font-size: 11px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--bg-3);
		color: var(--text-dim);
	}
</style>
