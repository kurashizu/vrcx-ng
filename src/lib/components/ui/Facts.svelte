<script>
	/** Grid of label/value cells (see Fact). @type {{ children: import('svelte').Snippet, min?: number }} */
	let { children, min = 150 } = $props();
</script>

<div class="facts" style:--min="{min}px">{@render children()}</div>

<style>
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--min), 1fr));
		gap: 8px;
	}
</style>
