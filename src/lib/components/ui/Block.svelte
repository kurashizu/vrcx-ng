<script>
	/** A titled group inside a dialog body. @type {{ title?: string, hint?: string, actions?: import('svelte').Snippet, children: import('svelte').Snippet }} */
	let { title = '', hint = '', actions, children } = $props();
</script>

<section>
	{#if title || actions}
		<div class="head">
			<h3>{title}</h3>
			{#if hint}<span class="faint small">{hint}</span>{/if}
			{#if actions}<span class="spacer"></span>{@render actions()}{/if}
		</div>
	{/if}
	{@render children()}
</section>

<style>
	section {
		margin-top: 18px;
	}
	section:first-child {
		margin-top: 0;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 8px;
	}
	h3 {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
</style>
