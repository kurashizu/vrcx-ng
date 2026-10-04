<script>
	import { trustColor } from '$lib/shared/trust.js';
	import { trustColorsOn } from '$lib/stores/settings.js';

	/**
	 * A display name in its trust-rank colour (when enabled in settings) with
	 * the VRC+ marker. `user` carries tags / developerType / trustRank / vrcPlus.
	 *
	 * @type {{ user?: any, name?: string, plus?: boolean }}
	 */
	let { user = null, name = '', plus } = $props();

	const label = $derived(name || user?.displayName || '');
	const cls = $derived($trustColorsOn && user ? trustColor(user) : '');
	const showPlus = $derived(plus ?? !!user?.vrcPlus);
</script>

<span class="user-name"><span class="n ellipsis {cls}">{label}</span>{#if showPlus}<span class="plus" title="VRC+">+</span>{/if}</span>

<style>
	.user-name {
		display: inline-flex;
		align-items: baseline;
		gap: 4px;
		min-width: 0;
		font-weight: 600;
	}
	.plus {
		flex: none;
		font-size: 9px;
		font-weight: 800;
		line-height: 1;
		padding: 2px 4px;
		border-radius: 4px;
		background: linear-gradient(135deg, #fcd34d, #fb923c);
		color: #2b1c00;
		align-self: center;
	}
</style>
