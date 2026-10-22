<script>
	import { openUser } from '$lib/stores/overlay.js';

	/**
	 * A name that opens the player info dialog. Safe inside rows, chips and labels that have their own click:
	 * the click never reaches them. Without an id it is plain text.
	 * @type {{ id?: string | null, name?: string, accountId?: string, children?: import('svelte').Snippet }}
	 */
	let { id = '', name = '', accountId = '', children } = $props();
	const ok = $derived(typeof id === 'string' && id.startsWith('usr_'));
</script>

{#if ok}
	<span
		class="ulink"
		role="link"
		tabindex="0"
		title="Open player info"
		onclick={(e) => { e.preventDefault(); e.stopPropagation(); openUser(id, { accountId, name }); }}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.stopPropagation(), openUser(id, { accountId, name }))}
	>{#if children}{@render children()}{:else}{name}{/if}</span>
{:else}
	{#if children}{@render children()}{:else}{name}{/if}
{/if}

<style>
	.ulink {
		cursor: pointer;
		border-radius: 3px;
	}
	.ulink:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.ulink:focus-visible {
		outline: 1px solid var(--accent, #7c83ff);
	}
</style>
