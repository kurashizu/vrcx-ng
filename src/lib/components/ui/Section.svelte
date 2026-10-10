<script>
	import Icon from './Icon.svelte';
	/**
	 * Collapsible block with a header line. Controlled when `ontoggle` is given
	 * (state kept by the parent, e.g. persisted), otherwise it remembers itself.
	 *
	 * @type {{
	 *   title?: string,
	 *   icon?: string,
	 *   count?: number | null,
	 *   dot?: string,
	 *   open?: boolean,
	 *   ontoggle?: (open: boolean) => void,
	 *   header?: import('svelte').Snippet,
	 *   actions?: import('svelte').Snippet,
	 *   children: import('svelte').Snippet
	 * }}
	 */
	let { title = '', icon = '', count = null, dot = '', open: openProp = true, ontoggle, header, actions, children } = $props();

	let local = $state(true);
	const open = $derived(ontoggle ? openProp : local);

	function toggle() {
		if (ontoggle) ontoggle(!open);
		else local = !local;
	}
</script>

<section>
	<div
		class="head"
		role="button"
		tabindex="0"
		aria-expanded={open}
		onclick={toggle}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
	>
		<span class="chev" class:open><Icon name="chevron-right" size="12px" /></span>
		{#if dot}<span class="dot" style:--c={dot}></span>{/if}
		{#if header}
			{@render header()}
		{:else}
			{#if icon}<Icon name={icon} />{/if}
			<span class="title ellipsis">{title}</span>
		{/if}
		{#if count != null}<span class="count">{count}</span>{/if}
		{#if actions}<span class="spacer"></span>{@render actions()}{/if}
	</div>
	{#if open}
		<div class="content">{@render children()}</div>
	{/if}
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		min-height: 30px;
		cursor: pointer;
		font-size: 12px;
		font-weight: 650;
		color: var(--text-dim);
		user-select: none;
	}
	.head:hover {
		color: var(--text);
	}
	.chev {
		flex: none;
		font-size: 10px;
		transition: transform 0.12s;
		color: var(--text-faint);
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c);
	}
	.title {
		min-width: 0;
	}
	.count {
		flex: none;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-faint);
	}
</style>
