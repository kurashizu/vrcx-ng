<script>
	import Icon from './Icon.svelte';
	/**
	 * The one way to show "loading…", "failed (retry)" and "nothing here".
	 * @type {{ kind?: 'loading'|'error'|'empty', text?: string, onretry?: () => void, icon?: string }}
	 */
	let { kind = 'empty', text = '', onretry, icon = '' } = $props();
</script>

<div class="notice {kind}">
	{#if kind === 'loading'}
		<span class="spinner"></span>
		<span>{text || 'Loading…'}</span>
	{:else if kind === 'error'}
		<span class="error-text"><Icon name="alert" /> {text || 'Failed to load'}</span>
		{#if onretry}<button class="btn sm" onclick={onretry}>Retry</button>{/if}
	{:else}
		{#if icon}<span class="icon"><Icon name={icon} size="1.6em" /></span>{/if}
		<span class="muted">{text || 'Nothing here'}</span>
	{/if}
</div>

<style>
	.notice {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 36px 16px;
		text-align: center;
		color: var(--text-dim);
	}
	.loading {
		flex-direction: row;
	}
	.icon {
		font-size: 34px;
		opacity: 0.6;
	}
</style>
