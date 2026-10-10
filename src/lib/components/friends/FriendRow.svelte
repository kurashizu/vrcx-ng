<script>
	import Icon from '../ui/Icon.svelte';
	import { timeAgo } from '$lib/shared/format.js';
	import { platformLabel } from '$lib/shared/presence.js';
	import { describeLocation } from '$lib/shared/location.js';
	import { openUser, openAvatar } from '$lib/stores/overlay.js';
	import { openFriendMenu } from '$lib/client/friendMenu.js';
		import { settings } from '$lib/stores/settings.js';
	import { now } from '$lib/stores/clock.js';
	import Avatar from '../ui/Avatar.svelte';
	import UserName from '../ui/UserName.svelte';
	import Place from '../ui/Place.svelte';
	import AccessBadge from '../ui/AccessBadge.svelte';
	import StatusPill from '../ui/StatusPill.svelte';

	/**
	 * One friend in the sidebar list. `place` says how much of the location to
	 * repeat: 'full' = world + access type, 'access' = only the access type
	 * (the surrounding section is the world), 'none' = nothing (the section is
	 * the instance).
	 * @type {{ friend: import('$lib/stores/friends.js').Friend, place?: 'full'|'access'|'none' }}
	 */
	let { friend: f, place: show = 'full' } = $props();

	const accountId = $derived(f.accountIds?.[0] || '');
	const place = $derived(describeLocation(f.location, f.worldName));
	const inInstance = $derived(f.state === 'online' && place.kind === 'instance');

	const open = () => openUser(f.id, { accountId, name: f.displayName });
</script>

<div
	class="row"
	role="button"
	tabindex="0"
	title={f.accountIds?.length ? `via ${f.accountIds.length} accounts` : ''}
	onclick={open}
	onkeydown={(e) => e.key === 'Enter' && open()}
	oncontextmenu={(e) => openFriendMenu(e, f)}
>
	<Avatar src={f.currentAvatarThumbnailImageUrl} name={f.displayName} size={34} {accountId} presence={f.state} status={f.status} />
	<div class="info">
		<div class="line">
			<UserName user={f} />
			<StatusPill status={f.status} />
			{#if f.platform && f.state === 'online'}<span class="plat">{platformLabel(f.platform)}</span>{/if}
			{#if f.accountIds?.length > 1}<span class="plat" title="Friends with {f.accountIds.length} of your accounts">×{f.accountIds.length}</span>{/if}
		</div>
		<div class="line sub">
			{#if f.state === 'online'}
				{#if show === 'none'}
					{#if f.statusDescription}<span class="faint ellipsis">{f.statusDescription}</span>{/if}
				{:else if show === 'access' && place.kind === 'instance'}
					<AccessBadge {place} showPublic />
					{#if f.statusDescription}<span class="faint ellipsis">{f.statusDescription}</span>{/if}
				{:else if place.kind === 'instance' || place.kind === 'traveling'}
					<Place location={f.location} worldName={f.worldName} {accountId} />
				{:else}
					<span class="faint"><Icon name="eye-off" /> Hidden</span>
				{/if}
			{:else if f.state === 'active'}
				<span class="faint">Online (not in game)</span>
			{:else}
				<span class="faint">{f.lastSeen && $settings['friend.showLastSeen'] !== false ? `Offline ${timeAgo(f.lastSeen, $now)}` : 'Offline'}</span>
			{/if}
		</div>
		{#if f.statusDescription && f.state !== 'offline' && show === 'full'}
			<div class="desc ellipsis">{f.statusDescription}</div>
		{/if}
	</div>
	<div class="tools">
		{#if f.currentAvatar}
			<button class="tool" title="View current avatar" onclick={(e) => (e.stopPropagation(), openAvatar(f.currentAvatar, accountId))}><Icon name="user" /></button>
		{/if}
	</div>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px 6px 14px;
		cursor: pointer;
	}
	.row:hover,
	.row:focus-visible {
		background: var(--bg-2);
		outline: none;
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		font-size: 13px;
	}
	.sub {
		font-size: 12px;
		color: var(--text-dim);
	}
	.plat {
		flex: none;
		font-size: 10.5px;
		color: var(--text-faint);
	}
	.desc {
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.tools {
		flex: none;
		display: flex;
		gap: 2px;
		opacity: 0;
	}
	.row:hover .tools,
	.row:focus-within .tools {
		opacity: 1;
	}
	@media (hover: none) {
		.tools {
			opacity: 1;
		}
	}
	.tool {
		width: 24px;
		height: 24px;
		border-radius: var(--r-sm);
		display: grid;
		place-items: center;
		font-size: 12px;
		color: var(--text-dim);
	}
	.tool:hover {
		background: var(--bg-3);
		color: var(--text);
	}
</style>
