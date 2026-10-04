<script>
	import { contextMenu, hideContextMenu } from '$lib/stores/overlay.js';

	/** @type {HTMLElement | undefined} */
	let el = $state();
	let pos = $state({ left: 0, top: 0 });
	/** drill-down path for items that carry a `sub` list */
	let trail = $state(/** @type {{ label: string, items: any[] }[]} */ ([]));

	const items = $derived(trail.at(-1)?.items ?? $contextMenu?.items ?? []);

	$effect(() => {
		$contextMenu;
		trail = [];
	});

	// keep the menu on screen (re-measured when the drill-down changes its size)
	$effect(() => {
		items;
		if (!el || !$contextMenu) return;
		const r = el.getBoundingClientRect();
		pos = {
			left: Math.max(8, Math.min($contextMenu.x, innerWidth - r.width - 8)),
			top: Math.max(8, Math.min($contextMenu.y, innerHeight - r.height - 8))
		};
	});

	function pick(item) {
		if (item.disabled) return;
		if (item.sub) {
			trail = [...trail, { label: item.label, items: item.sub }];
			return;
		}
		hideContextMenu();
		Promise.resolve(item.action?.()).catch((err) => console.error('menu action', err));
	}

	function onOutside(e) {
		if ($contextMenu && el && !el.contains(e.target)) hideContextMenu();
	}
</script>

<svelte:window
	onmousedown={onOutside}
	onkeydown={(e) => e.key === 'Escape' && $contextMenu && (trail.length ? (trail = trail.slice(0, -1)) : hideContextMenu())}
	onresize={hideContextMenu}
	onscrollcapture={() => $contextMenu && hideContextMenu()}
/>

{#if $contextMenu}
	<div class="menu" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px" role="menu" tabindex="-1" oncontextmenu={(e) => e.preventDefault()}>
		{#if trail.length}
			<button class="item back" onclick={() => (trail = trail.slice(0, -1))}>
				<span class="ico">‹</span><span class="lbl">{trail.at(-1)?.label}</span>
			</button>
			<div class="sep"></div>
		{:else if $contextMenu.header}
			<div class="head">
				<div class="title ellipsis">{$contextMenu.header.title}</div>
				{#if $contextMenu.header.subtitle}<div class="sub ellipsis">{$contextMenu.header.subtitle}</div>{/if}
			</div>
		{/if}
		{#each items as item}
			{#if item.divider}
				<div class="sep"></div>
			{:else}
				<button class="item" class:danger={item.danger} disabled={item.disabled} role="menuitem" onclick={() => pick(item)}>
					<span class="ico">{item.icon || ''}</span>
					<span class="lbl">{item.label}</span>
					{#if item.sub}<span class="more">›</span>{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.menu {
		position: fixed;
		z-index: var(--z-menu);
		width: 232px;
		max-height: calc(100dvh - 16px);
		overflow-y: auto;
		padding: 4px;
		background: var(--bg-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-lg);
		animation: fade 0.1s;
	}
	.head {
		padding: 6px 10px 8px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 4px;
	}
	.title {
		font-weight: 650;
	}
	.sub {
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		border-radius: var(--r-sm);
		font-size: 13px;
	}
	.item:hover:not(:disabled) {
		background: var(--accent-soft);
	}
	.item:disabled {
		opacity: 0.4;
	}
	.item.danger {
		color: var(--danger);
	}
	.item.back {
		color: var(--text-dim);
	}
	.ico {
		width: 18px;
		text-align: center;
		flex: none;
	}
	.lbl {
		flex: 1;
		min-width: 0;
	}
	.more {
		color: var(--text-faint);
	}
	.sep {
		height: 1px;
		margin: 4px 6px;
		background: var(--border);
	}
</style>
