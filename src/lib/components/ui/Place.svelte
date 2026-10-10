<script>
	import Icon from './Icon.svelte';
	import { describeLocation } from '$lib/shared/location.js';
	import { shortId } from '$lib/shared/format.js';
	import { openWorld } from '$lib/stores/overlay.js';
	import { settings } from '$lib/stores/settings.js';
	import { worldNames } from '$lib/stores/friends.js';
	import AccessBadge from './AccessBadge.svelte';

	/**
	 * Where someone is: the world (opens its dialog), access type and region.
	 * Renders nothing for offline / unknown locations so callers decide what
	 * to show instead.
	 *
	 * @type {{ location?: string, worldName?: string, accountId?: string, link?: boolean, showPublic?: boolean }}
	 */
	let { location = '', worldName = '', accountId = '', link = true, showPublic = false } = $props();

	const place = $derived.by(() => {
		const d = describeLocation(location, worldName);
		const name = worldName || $worldNames.get(d.worldId) || '';
		return name ? { ...d, worldName: name } : d;
	});
</script>

{#if place.kind === 'instance'}
	{@const label = place.worldName || shortId(place.worldId)}
	{#if link}
		<button
			class="world"
			title={place.tag}
			onclick={(e) => {
				e.stopPropagation();
				openWorld(place.worldId, accountId);
			}}>{label}</button
		>
	{:else}
		<span class="world plain" title={place.tag}>{label}</span>
	{/if}
	<AccessBadge {place} {showPublic} />
	{#if $settings['ui.showInstanceId'] && place.instance}
		<span class="inst faint">{place.instance}</span>
	{/if}
{:else if place.kind === 'private'}
	<span class="faint"><Icon name="eye-off" /> Hidden</span>
{:else if place.kind === 'traveling'}
	<span class="faint"><Icon name="plane" /> Traveling</span>
{/if}

<style>
	.world {
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		text-align: left;
	}
	button.world:hover {
		color: var(--accent-ink);
		text-decoration: underline;
	}
	.inst {
		font-size: 11px;
	}
</style>
