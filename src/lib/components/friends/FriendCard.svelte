<script>
	import Icon from '../ui/Icon.svelte';
	import { platformLabel } from '$lib/shared/presence.js';
	import { openUser, openAvatar } from '$lib/stores/overlay.js';
	import { openFriendMenu } from '$lib/client/friendMenu.js';
	import Avatar from '../ui/Avatar.svelte';
	import UserName from '../ui/UserName.svelte';
	import Place from '../ui/Place.svelte';
	import StatusPill from '../ui/StatusPill.svelte';

	/** A friend as a tile in the overview grid. @type {{ friend: import('$lib/stores/friends.js').Friend }} */
	let { friend: f } = $props();

	const accountId = $derived(f.accountIds?.[0] || '');
	const open = () => openUser(f.id, { accountId, name: f.displayName });
</script>

<div
	class="card"
	class:dim={f.state === 'offline'}
	role="button"
	tabindex="0"
	onclick={open}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
	oncontextmenu={(e) => openFriendMenu(e, f)}
>
	<Avatar src={f.currentAvatarThumbnailImageUrl} name={f.displayName} size={52} {accountId} presence={f.state} status={f.status} square />
	<div class="info">
		<div class="name"><UserName user={f} /></div>
		{#if f.statusDescription}<div class="desc ellipsis" title={f.statusDescription}>{f.statusDescription}</div>{/if}
		{#if f.state === 'online'}
			<div class="place"><Place location={f.location} worldName={f.worldName} {accountId} showPublic /></div>
		{/if}
		<div class="meta">
			<StatusPill status={f.status} />
			{#if f.platform}<span class="faint">{platformLabel(f.platform)}</span>{/if}
			{#if f.accountIds?.length > 1}<span class="faint" title="Friends with {f.accountIds.length} of your accounts">×{f.accountIds.length}</span>{/if}
		</div>
	</div>
	{#if f.currentAvatar}
		<button class="av" title="View current avatar" onclick={(e) => (e.stopPropagation(), openAvatar(f.currentAvatar, accountId))}><Icon name="user" /></button>
	{/if}
</div>

<style>
	.card {
		position: relative;
		display: flex;
		gap: 12px;
		padding: 12px;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		cursor: pointer;
		transition: border-color 0.12s, background 0.12s;
	}
	.card:hover,
	.card:focus-visible {
		border-color: var(--border-strong);
		background: var(--bg-2);
		outline: none;
	}
	.dim {
		opacity: 0.7;
	}
	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		display: flex;
		font-size: 14px;
	}
	.desc {
		font-size: 12px;
		color: var(--text-dim);
	}
	.place {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 6px;
		font-size: 12.5px;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11.5px;
	}
	.av {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 24px;
		height: 24px;
		border-radius: var(--r-sm);
		opacity: 0;
		font-size: 12px;
	}
	.card:hover .av,
	.card:focus-within .av {
		opacity: 1;
		background: var(--bg-3);
	}
</style>
