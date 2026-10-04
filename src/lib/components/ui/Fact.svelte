<script>
	/** One cell of a Facts grid. @type {{ label: string, children: import('svelte').Snippet, wide?: boolean }} */
	let { label, children, wide = false } = $props();
</script>

<div class="fact" class:wide>
	<div class="lbl">{label}</div>
	<div class="val">{@render children()}</div>
</div>

<style>
	.fact {
		min-width: 0;
		padding: 8px 12px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--r);
	}
	.wide {
		grid-column: 1 / -1;
	}
	.lbl {
		font-size: 11px;
		color: var(--text-faint);
		margin-bottom: 1px;
	}
	.val {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 6px;
		overflow-wrap: anywhere;
	}
</style>
