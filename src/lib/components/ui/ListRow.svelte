<script>
	import Avatar from './Avatar.svelte';

	/**
	 * A clickable list row: picture, two text lines and optional trailing content.
	 * @type {{
	 *   thumb?: string, name?: string, square?: boolean, accountId?: string, presence?: 'online'|'active'|'offline', status?: string, size?: number,
	 *   onclick?: () => void,
	 *   title: import('svelte').Snippet,
	 *   meta?: import('svelte').Snippet,
	 *   trailing?: import('svelte').Snippet
	 * }}
	 */
	let { thumb = '', name = '', square = false, accountId = '', presence, status = '', size = 40, onclick, title, meta, trailing } = $props();
</script>

<div
	class="row"
	role="button"
	tabindex="0"
	{onclick}
	onkeydown={(e) => e.key === 'Enter' && onclick?.()}
>
	<Avatar src={thumb} {name} {size} {accountId} {presence} {status} {square} />
	<div class="text">
		<div class="top">{@render title()}</div>
		{#if meta}<div class="meta">{@render meta()}</div>{/if}
	</div>
	{#if trailing}<div class="trail">{@render trailing()}</div>{/if}
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		cursor: pointer;
	}
	.row:hover,
	.row:focus-visible {
		background: var(--bg-2);
		border-color: var(--border-strong);
		outline: none;
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.top {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px 8px;
		font-size: 14px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 8px;
		font-size: 12px;
		color: var(--text-faint);
		overflow-wrap: anywhere;
	}
	.trail {
		flex: none;
		display: flex;
		align-items: center;
		gap: 6px;
	}
</style>
