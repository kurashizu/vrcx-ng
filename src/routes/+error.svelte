<script>
	import { page } from '$app/state';
	import Icon from '$lib/components/ui/Icon.svelte';
</script>

<svelte:head>
	<title>{page.status} · vrcx-ng</title>
</svelte:head>

<div class="err">
	<div class="code">{page.status}</div>
	<p class="muted">{page.status === 404 ? `Nothing lives at ${page.url.pathname}.` : page.error?.message || 'Something went wrong.'}</p>
	<a class="btn primary" href="/"><Icon name="arrow-left" /> Back to the feed</a>
</div>

<style>
	.err {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		height: 100%;
		min-height: 320px;
		text-align: center;
	}
	.code {
		font-size: 56px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--text-faint);
	}
</style>
