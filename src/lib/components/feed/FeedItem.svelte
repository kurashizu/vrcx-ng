<script>
	import { feedMeta, entryVerb } from '$lib/shared/feed.js';
	import { timeAgo, formatDateTime, formatDuration, vrImage, clip } from '$lib/shared/format.js';
	import { describeLocation } from '$lib/shared/location.js';
	import { STATUS_COLOR } from '$lib/shared/presence.js';
	import { friendIndex } from '$lib/stores/friends.js';
	import { accountById, accountLabel } from '$lib/stores/accounts.js';
	import { openUser, openAvatar } from '$lib/stores/overlay.js';
	import { openFriendMenu } from '$lib/client/friendMenu.js';
	import { now } from '$lib/stores/clock.js';
	import Avatar from '../ui/Avatar.svelte';
	import UserName from '../ui/UserName.svelte';
	import Place from '../ui/Place.svelte';

	/** @type {{ entry: import('$lib/shared/feed.js').FeedEntry, cards?: boolean }} */
	let { entry, cards = false } = $props();

	const meta = $derived(feedMeta(entry.type));
	const friend = $derived($friendIndex.get(entry.userId));
	// some events only carry a bare usr_id — resolve the name from the friend snapshot
	const name = $derived(
		entry.displayName && entry.displayName !== entry.userId ? entry.displayName : friend?.displayName || entry.displayName || entry.userId || '?'
	);
	const thumb = $derived(entry.userThumbnailUrl || friend?.currentAvatarThumbnailImageUrl || '');
	const account = $derived($accountById.get(entry.accountId));
	const via = $derived((account && accountLabel(account)) || entry.accountDisplayName || String(entry.accountId || '').slice(0, 6));

	const place = $derived(describeLocation(entry.location, entry.worldName));
	const showPlace = $derived(['Online', 'GPS', 'Invite'].includes(entry.type) && place.kind === 'instance');
	// a freshly arrived entry slides in; the initial list renders still
	const fresh = $derived(Date.now() - Date.parse(entry.created_at) < 5000);

	const avatarId = (url) => String(url || '').match(/avtr_[a-f0-9-]+/i)?.[0] || '';
	const prevStatus = $derived(entry.previousStatus);

	const open = () => entry.userId && openUser(entry.userId, { accountId: entry.accountId, name });
	const menu = (e) => {
		if (!entry.userId) return;
		openFriendMenu(
			e,
			friend ?? { id: entry.userId, displayName: name, location: entry.location, worldName: entry.worldName, accountIds: [entry.accountId] }
		);
	};
</script>

<div
	class="entry"
	class:cards
	class:fresh
	role="button"
	tabindex="0"
	style:--c={meta.color}
	onclick={open}
	onkeydown={(e) => e.key === 'Enter' && open()}
	oncontextmenu={menu}
>
	<Avatar src={thumb} {name} size={cards ? 44 : 38} accountId={entry.accountId} pip={via} />

	<div class="body">
		<div class="line">
			<span class="icon" title={entry.type}>{meta.icon}</span>
			{#if entry.userId}
				<UserName user={friend} {name} />
			{:else}
				<strong>{name}</strong>
			{/if}
			<span class="verb">{entryVerb(entry)}</span>

			{#if entry.type === 'Status'}
				<span class="flow">
					{#if prevStatus}<i style:--c={STATUS_COLOR[prevStatus]}></i>{prevStatus} →{/if}
					<i style:--c={STATUS_COLOR[entry.status]}></i>{entry.status}
				</span>
			{:else if entry.type === 'DisplayName'}
				<span class="flow">{entry.previousDisplayName} → {entry.displayName}</span>
			{:else if entry.type === 'TrustLevel'}
				<span class="flow">{entry.previousTrustLevel} → {entry.trustLevel}</span>
			{:else if entry.type === 'Avatar' && entry.avatarName}
				<span class="flow">→ {entry.avatarName}</span>
			{/if}

			{#if showPlace}
				<span class="place"><Place location={entry.location} worldName={entry.worldName} accountId={entry.accountId} /></span>
			{:else if entry.type === 'Invite' && entry.worldName}
				<span class="place">{entry.worldName}</span>
			{/if}
		</div>

		{#if entry.type === 'Offline' && (entry.worldName || entry.time)}
			<div class="detail faint">
				{#if entry.worldName}在 {entry.worldName}{/if}{#if entry.worldName && entry.time}<span class="dot"> · </span>{/if}{#if entry.time}在线 {formatDuration(entry.time)}{/if}
			</div>
		{:else if entry.type === 'GPS' && entry.previousLocation}
			<div class="detail faint">
				从 {entry.previousWorldName || describeLocation(entry.previousLocation).worldId || '未知世界'}{#if entry.time}<span class="dot"> · </span>停留 {formatDuration(entry.time)}{/if}
			</div>
		{:else if entry.type === 'Status' && (entry.statusDescription || entry.previousStatusDescription)}
			<div class="detail">{entry.previousStatusDescription || ''} → {entry.statusDescription || ''}</div>
		{:else if entry.type === 'Bio' && entry.bio}
			<div class="detail">{clip(entry.bio, 200)}</div>
		{:else if entry.detail && !['Online', 'GPS', 'Offline', 'Status', 'Bio', 'Avatar'].includes(entry.type)}
			<div class="detail">{entry.detail}</div>
		{/if}

		{#if entry.type === 'Avatar'}
			<div class="swap">
				{#each [{ label: '之前', thumb: entry.previousCurrentAvatarThumbnailImageUrl, id: avatarId(entry.previousCurrentAvatarImageUrl) }, { label: '现在', thumb: entry.currentAvatarThumbnailImageUrl, id: avatarId(entry.currentAvatarImageUrl) }] as a, i (i)}
					{#if a.thumb}
						<button class="avi" title={a.id ? '查看模型' : ''} disabled={!a.id} onclick={(e) => (e.stopPropagation(), openAvatar(a.id, entry.accountId))}>
							<img src={vrImage(a.thumb, entry.accountId)} alt="" loading="lazy" />
							<span>{a.label}</span>
						</button>
					{/if}
					{#if i === 0 && entry.previousCurrentAvatarThumbnailImageUrl && entry.currentAvatarThumbnailImageUrl}<span class="arrow">→</span>{/if}
				{/each}
			</div>
		{/if}

		<div class="meta">
			<span title={account?.username || ''}>via {via}</span>
			<span class="dot">·</span>
			<span title={formatDateTime(entry.created_at)}>{timeAgo(entry.created_at, $now)}</span>
		</div>
	</div>
</div>

<style>
	.entry {
		display: flex;
		min-width: 0;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		cursor: pointer;
		/* a thin accent stripe in the event colour */
		box-shadow: inset 3px 0 0 color-mix(in srgb, var(--c) 70%, transparent);
	}
	.entry:hover,
	.entry:focus-visible {
		background: var(--bg-1);
		outline: none;
	}
	.fresh {
		animation: slide-in 0.25s ease;
	}
	.cards {
		flex: 1 1 300px;
		max-width: 520px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		background: var(--bg-1);
	}
	.cards:hover {
		border-color: var(--border-strong);
		background: var(--bg-2);
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px 6px;
		font-size: 13.5px;
	}
	.icon {
		font-size: 13px;
	}
	.verb {
		color: var(--text-dim);
	}
	.flow {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 550;
	}
	.flow i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--c, var(--text-faint));
	}
	.place {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		min-width: 0;
		max-width: 100%;
	}
	.detail {
		margin-top: 2px;
		font-size: 12.5px;
		color: var(--text-dim);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.detail.faint {
		color: var(--text-faint);
	}
	.swap {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}
	.avi {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: var(--r);
		font-size: 10.5px;
		color: var(--text-faint);
	}
	.avi:not(:disabled):hover {
		background: var(--bg-3);
		border-color: var(--border-strong);
	}
	.avi img {
		width: 68px;
		height: 68px;
		border-radius: var(--r-sm);
		object-fit: cover;
	}
	.arrow {
		color: var(--text-faint);
		font-size: 18px;
	}
	.meta {
		display: flex;
		gap: 5px;
		margin-top: 3px;
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.dot {
		opacity: 0.6;
	}
</style>
