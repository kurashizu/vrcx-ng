<script>
	import UserLink from './UserLink.svelte';
	import { friendIndex } from '$lib/stores/friends.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { userNames, ensureUserNames } from '$lib/stores/userNames.js';
	import { groupInfo, ensureGroups } from '$lib/stores/groups.js';
	/**
	 * Instance access type (Invite / Friends+ / Group…) and region as small badges.
	 * Public instances show nothing unless `showPublic`.
	 *
	 * @type {{ place: ReturnType<typeof import('$lib/shared/location.js').describeLocation>, showPublic?: boolean }}
	 */
	let { place, showPublic = false } = $props();

	// a group instance also says which group (name fetched once, shared by every badge)
	const gid = $derived((place.kind === 'instance' && place.parsed?.groupId) || '');
	$effect(() => {
		if (gid) ensureGroups([gid]);
	});
	const group = $derived(gid ? $groupInfo[gid] : null);

	// a Friends / Friends+ / Invite instance says who created it: a friend, one of our own accounts, or looked up once
	const ownerId = $derived((place.kind === 'instance' && place.parsed?.userId) || '');
	const ownerName = $derived(
		!ownerId ? '' : $friendIndex.get(ownerId)?.displayName || $accounts.find((a) => a.currentUser?.id === ownerId)?.currentUser?.displayName || $userNames[ownerId] || ''
	);
	$effect(() => {
		if (ownerId && !ownerName) ensureUserNames([ownerId]);
	});

	const show = $derived(place.kind === 'instance' && place.accessLabel && (showPublic || place.accessType !== 'public'));
</script>

{#if show}
	<span class="access {place.accessClass}">
		<span class="lbl">{place.accessLabel}</span>
		{#if ownerName}<span class="sub" title="Instance creator">by <UserLink id={ownerId} name={ownerName} /></span>{/if}
		{#if group?.name}<span class="sub" title={group.shortCode ? `${group.name} (${group.shortCode}.${group.discriminator})` : group.name}>{group.name}</span>{/if}
	</span>
{/if}
{#if place.region && (show || showPublic)}
	<span class="region">{place.region}</span>
{/if}

<style>
	.access {
		flex: 0 1 auto;
		min-width: 0;
		display: inline-flex;
		align-items: baseline;
		gap: 5px;
		overflow: hidden;
		padding: 0 6px;
		border-radius: 5px;
		font-size: 10.5px;
		font-weight: 650;
		line-height: 1.65;
		white-space: nowrap;
		background: color-mix(in srgb, var(--c, var(--text-dim)) 15%, transparent);
		color: var(--c, var(--text-dim));
	}
	.lbl {
		flex: none;
	}
	.sub {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		font-weight: 600;
		color: var(--text);
	}
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
