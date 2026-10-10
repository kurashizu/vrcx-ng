<script>
	import { STATUS_COLOR, STATUS_LABEL } from '$lib/shared/presence.js';

	/**
	 * The status a user picked in game. By default only the notable ones
	 * (Join Me / Ask Me / Busy) are drawn; `all` shows Online as well.
	 * @type {{ status?: string, all?: boolean }}
	 */
	let { status = '', all = false } = $props();

	const color = $derived(STATUS_COLOR[status]);
	const show = $derived(color && (all || status !== 'active'));
</script>

{#if show}
	<span class="pill" style:--c={color}><i></i>{STATUS_LABEL[status]}</span>
{/if}

<style>
	.pill {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0 7px;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.65;
		white-space: nowrap;
		color: var(--c);
		background: color-mix(in srgb, var(--c) 14%, transparent);
	}
	i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--c);
	}
</style>
