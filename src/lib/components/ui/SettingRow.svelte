<script>
	/** One line of a settings list: label + description on the left, the control on the right. @type {{ label: string, desc?: string, children: import('svelte').Snippet }} */
	let { label, desc = '', children } = $props();
</script>

<div class="setting">
	<div class="text">
		<div class="name">{label}</div>
		{#if desc}<div class="desc">{desc}</div>{/if}
	</div>
	<div class="control">{@render children()}</div>
</div>

<style>
	.setting {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 12px 0;
		border-bottom: 1px solid var(--border);
	}
	.setting:last-child {
		border-bottom: 0;
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.name {
		font-weight: 550;
	}
	.desc {
		margin-top: 2px;
		font-size: 12.5px;
		color: var(--text-dim);
	}
	.control {
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 50%;
	}
	.control :global(select),
	.control :global(input:not([type='checkbox'])) {
		width: 180px;
	}
	.control :global(input[type='number']) {
		width: 110px;
	}
</style>
