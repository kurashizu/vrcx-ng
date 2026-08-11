<script>
	import { contextMenu, hideContextMenu } from '$lib/stores/contextMenu.js';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let menuEl;

	function onWindowClick(e) {
		if (menuEl && !menuEl.contains(e.target)) hideContextMenu();
	}
	function onKeydown(e) {
		if (e.key === 'Escape') hideContextMenu();
	}
	function onScroll() {
		hideContextMenu();
	}
	function onContextMenu(e) {
		// Allow our own contextmenu to bubble, but suppress the browser one
		// when our menu is open
		if ($contextMenu?.open) {
			e.preventDefault();
		}
	}

	onMount(() => {
		if (!browser) return;
		window.addEventListener('mousedown', onWindowClick);
		window.addEventListener('keydown', onKeydown);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('contextmenu', onContextMenu);
	});
	onDestroy(() => {
		if (!browser) return;
		window.removeEventListener('mousedown', onWindowClick);
		window.removeEventListener('keydown', onKeydown);
		window.removeEventListener('scroll', onScroll, true);
		window.removeEventListener('contextmenu', onContextMenu);
	});

	async function runItem(item) {
		hideContextMenu();
		try {
			await item.action();
		} catch (err) {
			console.error('context menu action', err);
		}
	}

	// position clamp so menu doesn't fall off screen
	const style = $derived.by(() => {
		if (!$contextMenu) return '';
		const { x, y } = $contextMenu;
		const W = 240;
		const H = 320;
		const iw = browser ? window.innerWidth : 1024;
		const ih = browser ? window.innerHeight : 768;
		const left = Math.min(x, iw - W - 8);
		const top = Math.min(y, ih - H - 8);
		return `left:${left}px; top:${top}px;`;
	});
</script>

{#if $contextMenu?.open}
	<div
		class="menu"
		bind:this={menuEl}
		style={style}
		role="menu"
		tabindex="-1"
		oncontextmenu={(e) => e.preventDefault()}
	>
		{#if $contextMenu.data?.displayName}
			<div class="header">
				<div class="hname">{$contextMenu.data.displayName}</div>
				{#if $contextMenu.data.location && $contextMenu.data.location !== 'offline'}
					<div class="hsub">{$contextMenu.data.location}</div>
				{:else if $contextMenu.data.state === 'offline'}
					<div class="hsub">离线</div>
				{:else if $contextMenu.data.state === 'active'}
					<div class="hsub">Active</div>
				{/if}
			</div>
		{/if}
		{#each $contextMenu.items as item, i}
			{#if item.divider}
				<div class="divider"></div>
			{:else}
				<button
					class="item"
					class:danger={item.danger}
					disabled={item.disabled}
					onclick={() => runItem(item)}
					role="menuitem"
				>
					<span class="ico">{item.icon || '•'}</span>
					<span class="lbl">{item.label}</span>
					{#if item.shortcut}
						<span class="kbd">{item.shortcut}</span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.menu {
		position: fixed;
		z-index: 200;
		min-width: 220px;
		max-width: 280px;
		background: var(--bg-2);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
		padding: 4px;
		animation: pop 0.08s ease-out;
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	.header {
		padding: 8px 12px 6px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 4px;
	}
	.hname {
		font-weight: 600;
		font-size: 13px;
	}
	.hsub {
		font-size: 11px;
		color: var(--text-faint);
		margin-top: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 240px;
	}
	.item {
		display: flex;
		gap: 10px;
		align-items: center;
		width: 100%;
		padding: 7px 10px;
		font-size: 13px;
		text-align: left;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: var(--text);
	}
	.item:hover:not(:disabled) {
		background: var(--bg-3);
	}
	.item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.item.danger {
		color: var(--danger);
	}
	.item.danger:hover:not(:disabled) {
		background: rgba(255, 93, 108, 0.15);
	}
	.ico {
		width: 18px;
		text-align: center;
		font-size: 14px;
	}
	.lbl {
		flex: 1;
	}
	.kbd {
		font-size: 10px;
		color: var(--text-faint);
		font-family: ui-monospace, monospace;
	}
	.divider {
		height: 1px;
		background: var(--border);
		margin: 4px 0;
	}
</style>
