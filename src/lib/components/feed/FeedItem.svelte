<script>
	import Icon from '../ui/Icon.svelte';
	import { feedMeta, entryVerb } from '$lib/shared/feed.js';
	import { timeAgo, formatDateTime, formatDuration, vrImage, clip } from '$lib/shared/format.js';
	import { describeLocation } from '$lib/shared/location.js';
	import { STATUS_COLOR } from '$lib/shared/presence.js';
	import { friendIndex } from '$lib/stores/friends.js';
	import { accountById, accountLabel } from '$lib/stores/accounts.js';
	import { openUser, openAvatar } from '$lib/stores/overlay.js';
	import { openFriendMenu } from '$lib/client/friendMenu.js';
	import { selfInvite, copyText, instanceLink } from '$lib/client/actions.js';
	import { now } from '$lib/stores/clock.js';
	import Avatar from '../ui/Avatar.svelte';
	import UserName from '../ui/UserName.svelte';
	import Place from '../ui/Place.svelte';

	/** @type {{ entry: import('$lib/shared/feed.js').FeedEntry, compact?: boolean }} */
	let { entry, compact = false, card = false } = $props();

	const meta = $derived(feedMeta(entry.type));
	const friend = $derived($friendIndex.get(entry.userId));
	// some events only carry a bare usr_id — resolve the name from the friend snapshot
	const name = $derived(
		entry.displayName && entry.displayName !== entry.userId ? entry.displayName : friend?.displayName || entry.displayName || entry.userId || '?'
	);
	const thumb = $derived(entry.userThumbnailUrl || friend?.currentAvatarThumbnailImageUrl || '');
	const account = $derived($accountById.get(entry.accountId));
	const labelOf = (id) => {
		const a = $accountById.get(id);
		return (a && accountLabel(a)) || String(id || '').slice(0, 6);
	};
	// one event can be seen by several accounts (they merge into one entry)
	const ids = $derived(entry.accounts?.length ? entry.accounts : [entry.accountId]);
	const via = $derived((account && accountLabel(account)) || entry.accountDisplayName || String(entry.accountId || '').slice(0, 6));
	const viaText = $derived(ids.length > 1 ? `${ids.length} accounts` : via);
	const viaTitle = $derived(ids.length > 1 ? ids.map(labelOf).join(', ') : account?.username || '');

	const place = $derived(describeLocation(entry.location, entry.worldName));
	const showPlace = $derived(['Online', 'GPS', 'Invite'].includes(entry.type) && place.kind === 'instance');
	// a freshly arrived entry slides in; the initial list renders still
	const fresh = $derived(Date.now() - Date.parse(entry.created_at) < 5000);

	const avatarId = (url) => String(url || '').match(/avtr_[a-f0-9-]+/i)?.[0] || '';
	const prevStatus = $derived(entry.previousStatus);

	const canJoin = $derived(['Online', 'GPS', 'Invite'].includes(entry.type) && place.kind === 'instance' && !!entry.accountId);

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
	class:compact
	class:card
	class:fresh
	role="button"
	tabindex="0"
	style:--c={meta.color}
	onclick={open}
	onkeydown={(e) => e.key === 'Enter' && open()}
	oncontextmenu={menu}
>
	<span class="av">
		<Avatar src={thumb} {name} size={compact ? 28 : 40} accountId={entry.accountId} />
		<span class="badge-ev" title={entry.type}><Icon name={meta.icon} size="11px" /></span>
	</span>

	<div class="body">
		<div class="line">
			{#if entry.userId}
				<UserName user={friend} {name} />
			{:else}
				<strong>{name}</strong>
			{/if}
			<span class="verb">{entryVerb(entry)}</span>
			{#if entry.type === 'GPS' && !showPlace && !place.worldId}
				<span class="faint">{place.kind === 'private' ? 'a private instance' : place.kind === 'traveling' ? 'another instance…' : 'an unknown place'}</span>
			{/if}

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
				{#if entry.worldName}at {entry.worldName}{/if}{#if entry.worldName && entry.time}<span class="dot"> · </span>{/if}{#if entry.time}online for {formatDuration(entry.time)}{/if}
			</div>
		{:else if entry.type === 'GPS' && entry.previousLocation}
			<div class="detail faint">
				from {entry.previousWorldName || describeLocation(entry.previousLocation).worldId || 'an unknown world'}{#if entry.time}<span class="dot"> · </span>stayed {formatDuration(entry.time)}{/if}
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
				{#each [{ label: 'Before', thumb: entry.previousCurrentAvatarThumbnailImageUrl, id: avatarId(entry.previousCurrentAvatarImageUrl) }, { label: 'Now', thumb: entry.currentAvatarThumbnailImageUrl, id: avatarId(entry.currentAvatarImageUrl) }] as a, i (i)}
					{#if a.thumb}
						<button class="avi" title={a.id ? 'View avatar' : ''} disabled={!a.id} onclick={(e) => (e.stopPropagation(), openAvatar(a.id, entry.accountId))}>
							<img src={vrImage(a.thumb, entry.accountId)} alt="" loading="lazy" />
							<span>{a.label}</span>
						</button>
					{/if}
					{#if i === 0 && entry.previousCurrentAvatarThumbnailImageUrl && entry.currentAvatarThumbnailImageUrl}<span class="arrow">→</span>{/if}
				{/each}
			</div>
		{/if}
	</div>

	<div class="side">
		<span class="time" title={formatDateTime(entry.created_at)}>{timeAgo(entry.created_at, $now)}</span>
		<span class="via" title={viaTitle}>via {viaText}</span>
		{#if canJoin}
			<div class="quick" role="group" aria-label="Quick actions">
				<button class="btn xs" title="Send yourself an invite to this instance" onclick={(e) => (e.stopPropagation(), ids.length > 1 ? menu(e) : selfInvite(entry.accountId, entry.location))}><Icon name="target" /> {ids.length > 1 ? 'Invite me…' : 'Invite me'}</button>
				<button class="btn ghost xs icon" title="Copy instance link" aria-label="Copy instance link" onclick={(e) => (e.stopPropagation(), copyText(instanceLink(entry.location), 'instance link'))}><Icon name="link" /></button>
			</div>
		{/if}
	</div>
</div>

<style>
	.entry {
		position: relative;
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) auto;
		align-items: start;
		gap: 0 14px;
		padding: 12px 20px;
		border-bottom: 1px solid var(--border);
		cursor: pointer;
		transition: background 0.12s;
	}
	.entry:hover,
	.entry:focus-visible {
		background: var(--bg-1);
		outline: none;
	}
	.fresh {
		animation: slide-in 0.25s ease;
	}
	/* avatar with the event type as a small badge in the corner */
	.av {
		position: relative;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
	}
	.badge-ev {
		position: absolute;
		right: -4px;
		bottom: -4px;
		display: grid;
		place-items: center;
		width: 19px;
		height: 19px;
		border-radius: 50%;
		background: var(--bg-0);
		border: 1.5px solid color-mix(in srgb, var(--c) 55%, var(--bg-0));
		color: var(--c);
		box-sizing: border-box;
	}
	.entry:hover .badge-ev {
		background: var(--bg-1);
	}
	.body {
		min-width: 0;
		padding-top: 1px;
	}
	.line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 3px 6px;
		font-size: 14px;
		line-height: 1.45;
	}
	.verb {
		color: var(--text-dim);
	}
	.flow {
		display: inline-flex;
		align-items: center;
		gap: 5px;
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
		gap: 5px;
		min-width: 0;
		max-width: 100%;
		font-weight: 550;
	}
	.detail {
		margin-top: 3px;
		font-size: 12.5px;
		color: var(--text-dim);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.detail.faint {
		color: var(--text-faint);
	}
	.dot {
		opacity: 0.6;
	}
	.swap {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
	}
	.avi {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
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
		width: 64px;
		height: 64px;
		border-radius: var(--r-sm);
		object-fit: cover;
	}
	.arrow {
		color: var(--text-faint);
		font-size: 18px;
	}
	/* right column: time + account; the join actions take the account's place on hover */
	.side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		min-width: 64px;
		padding-top: 2px;
		text-align: right;
		white-space: nowrap;
	}
	.time {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--text-dim);
	}
	.via {
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 11px;
		color: var(--text-faint);
	}
	.quick {
		position: absolute;
		right: 20px;
		bottom: 10px;
		display: flex;
		gap: 4px;
		padding: 3px;
		border-radius: var(--r);
		background: var(--bg-2);
		box-shadow: var(--shadow-sm);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.12s;
	}
	.entry:hover .quick,
	.entry:focus-within .quick {
		opacity: 1;
		pointer-events: auto;
	}
	@media (hover: none) {
		.quick {
			position: static;
			margin-top: 6px;
			opacity: 1;
			pointer-events: auto;
		}
	}

	/* compact: one line per entry */
	/* bubble: used inside the masonry; the time / account line moves to the bottom */
	.entry.card {
		min-width: 250px;
		max-width: 100%;
		grid-template-columns: 40px minmax(0, 1fr);
		gap: 0 12px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
		background: var(--bg-1);
		box-shadow: inset 3px 0 0 color-mix(in srgb, var(--c) 70%, transparent);
	}
	.entry.card:hover,
	.entry.card:focus-visible {
		border-color: var(--border-strong);
		background: var(--bg-2);
	}
	.card .side {
		grid-column: 2;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 6px;
		min-width: 0;
		margin-top: 8px;
		padding: 0;
		text-align: left;
	}
	.card .time::after {
		content: '·';
		margin-left: 6px;
		opacity: 0.5;
	}
	.card .quick {
		right: 10px;
		bottom: 8px;
	}
	.entry.compact {
		grid-template-columns: 28px minmax(0, 1fr) auto;
		align-items: center;
		gap: 0 12px;
		padding: 6px 20px;
	}
	.compact .av {
		width: 28px;
		height: 28px;
	}
	.compact .badge-ev {
		width: 15px;
		height: 15px;
		right: -3px;
		bottom: -3px;
	}
	.compact .body {
		padding: 0;
	}
	.compact .line {
		flex-wrap: nowrap;
		overflow: hidden;
		white-space: nowrap;
		font-size: 13.5px;
	}
	.compact .detail,
	.compact .swap,
	.compact .via {
		display: none;
	}
	.compact .side {
		padding: 0;
	}
	.compact .quick {
		bottom: 50%;
		transform: translateY(50%);
	}
</style>
