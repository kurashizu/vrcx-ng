<script>
	import Icon from './Icon.svelte';
	/**
	 * Standard frame for a full-page route: heading, optional actions on the
	 * right, scrolling body.
	 * @type {{ title: string, icon?: string, subtitle?: string, width?: 'narrow'|'normal'|'wide', actions?: import('svelte').Snippet, children: import('svelte').Snippet }}
	 */
	let { title, icon = '', subtitle = '', width = 'normal', actions, children } = $props();
</script>

<svelte:head>
	<title>{title} · vrcx-ng</title>
</svelte:head>

<div class="page">
	<div class="inner {width}">
		<header>
			<div class="titles">
				<h1>{#if icon}<span class="ico"><Icon name={icon} /></span>{/if}{title}</h1>
				{#if subtitle}<p class="muted">{subtitle}</p>{/if}
			</div>
			<span class="spacer"></span>
			{#if actions}<div class="actions">{@render actions()}</div>{/if}
		</header>
		{@render children()}
	</div>
</div>

<style>
	.page {
		height: 100%;
		overflow-y: auto;
		padding: 24px;
	}
	.inner {
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.narrow {
		max-width: 640px;
	}
	.normal {
		max-width: 860px;
	}
	.wide {
		max-width: 1100px;
	}
	header {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}
	h1 {
		font-size: 20px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.titles p {
		margin-top: 2px;
		font-size: 13px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	@media (max-width: 720px) {
		.page {
			padding: 14px;
		}
	}
</style>
