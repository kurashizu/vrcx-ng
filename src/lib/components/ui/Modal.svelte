<script module>
	/** Open modals, bottom → top. Only the top one reacts to Esc and backdrop clicks. */
	const stack = [];
</script>

<script>
	import Icon from './Icon.svelte';
	import { onMount } from 'svelte';

	/**
	 * Dialog shell shared by everything that pops up: backdrop, Esc / outside-click
	 * to close, stacking of dialogs on dialogs, and a scrolling body.
	 *
	 * @type {{
	 *   onclose?: () => void,
	 *   title?: string,
	 *   size?: 'sm'|'md'|'lg'|'xl',
	 *   flush?: boolean,
	 *   children: import('svelte').Snippet,
	 *   footer?: import('svelte').Snippet
	 * }}
	 */
	let { onclose, title = '', size = 'md', flush = false, children, footer } = $props();

	const id = Symbol();
	let downOnBackdrop = false;
	/** @type {HTMLElement | undefined} */
	let dialogEl = $state();

	onMount(() => {
		stack.push(id);
		// a field marked data-autofocus gets the cursor
		dialogEl?.querySelector('[data-autofocus]')?.focus();
		const onKey = (e) => {
			if (e.key !== 'Escape' || stack.at(-1) !== id) return;
			e.stopPropagation();
			onclose?.();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			stack.splice(stack.indexOf(id), 1);
			window.removeEventListener('keydown', onKey);
		};
	});

	/** Move to <body> so later-opened dialogs always paint above earlier ones. */
	function portal(node) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
</script>

<div
	class="backdrop"
	use:portal
	role="presentation"
	onmousedown={(e) => (downOnBackdrop = e.target === e.currentTarget)}
	onclick={(e) => downOnBackdrop && e.target === e.currentTarget && stack.at(-1) === id && onclose?.()}
>
	<div class="dialog {size}" role="dialog" aria-modal="true" aria-label={title || undefined} bind:this={dialogEl}>
		{#if title}
			<header>
				<h2>{title}</h2>
			</header>
		{/if}
		<button class="close" onclick={() => onclose?.()} aria-label="Close"><Icon name="x" /></button>
		<div class="body" class:flush>
			{@render children()}
		</div>
		{#if footer}
			<footer>{@render footer()}</footer>
		{/if}
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		background: rgba(4, 6, 12, 0.62);
		backdrop-filter: blur(2px);
		animation: fade 0.14s;
	}
	.dialog {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-height: min(92dvh, 900px);
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: var(--r-xl);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		animation: pop 0.18s cubic-bezier(0.2, 0.8, 0.3, 1);
	}
	.sm {
		max-width: 400px;
	}
	.md {
		max-width: 560px;
	}
	.lg {
		max-width: 760px;
	}
	.xl {
		max-width: 920px;
	}
	header {
		flex: none;
		padding: 16px 52px 12px 20px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		font-size: 16px;
		font-weight: 650;
	}
	.close {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 3;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 13px;
		color: var(--text-dim);
		background: color-mix(in srgb, var(--bg-1) 70%, transparent);
	}
	.close:hover {
		background: var(--bg-3);
		color: var(--text);
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 16px 20px;
	}
	.body.flush {
		padding: 0;
	}
	footer {
		flex: none;
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 20px;
		border-top: 1px solid var(--border);
		background: var(--bg-1);
	}
</style>
