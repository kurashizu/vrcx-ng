<script>
	/**
	 * Instance access type (Invite / Friends+ / Group…) and region as small badges.
	 * Public instances show nothing unless `showPublic`.
	 *
	 * @type {{ place: ReturnType<typeof import('$lib/shared/location.js').describeLocation>, showPublic?: boolean }}
	 */
	let { place, showPublic = false } = $props();

	const show = $derived(place.kind === 'instance' && place.accessLabel && (showPublic || place.accessType !== 'public'));
</script>

{#if show}
	<span class="access {place.accessClass}">{place.accessLabel}</span>
{/if}
{#if place.region && (show || showPublic)}
	<span class="region">{place.region}</span>
{/if}

<style>
	.access,
	.region {
		flex: none;
		display: inline-block;
		padding: 0 6px;
		border-radius: 5px;
		font-size: 10.5px;
		font-weight: 650;
		line-height: 1.65;
		white-space: nowrap;
		background: color-mix(in srgb, var(--c, var(--text-dim)) 15%, transparent);
		color: var(--c, var(--text-dim));
	}
	.region {
		--c: var(--text-dim);
		letter-spacing: 0.04em;
	}
	.at-public {
		--c: var(--online);
	}
	.at-invite {
		--c: var(--warn);
	}
	.at-invite-plus {
		--c: #fb923c;
	}
	.at-friends {
		--c: var(--accent);
	}
	.at-friends-plus {
		--c: #c084fc;
	}
	.at-group {
		--c: var(--link);
	}
</style>
