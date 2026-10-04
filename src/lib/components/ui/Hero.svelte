<script>
	import { vrImage } from '$lib/shared/format.js';

	/** Header of the detail dialogs: optional blurred backdrop image under the content. @type {{ bg?: string, accountId?: string, children: import('svelte').Snippet }} */
	let { bg = '', accountId = '', children } = $props();
</script>

<header class="hero">
	{#if bg}<div class="bg" style:background-image="url({vrImage(bg, accountId)})"></div>{/if}
	<div class="content">{@render children()}</div>
</header>

<style>
	.hero {
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid var(--border);
		background: linear-gradient(135deg, var(--accent-soft), transparent 70%), var(--bg-1);
	}
	.bg {
		position: absolute;
		inset: -20px;
		background-size: cover;
		background-position: center;
		filter: blur(18px) saturate(1.2);
		opacity: 0.35;
	}
	.bg::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, transparent, var(--bg-1));
	}
	.content {
		position: relative;
		display: flex;
		gap: 16px;
		align-items: center;
		padding: 22px 56px 18px 22px;
	}
</style>
