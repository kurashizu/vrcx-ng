<script>
	import EventIcon from './EventIcon.svelte';
	import { timeAgo, formatTime, locationLabel } from '$lib/shared/format.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { showContextMenu } from '$lib/stores/contextMenu.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { openWorldDetail } from '$lib/stores/worldDetail.js';
	import { toasts } from '$lib/stores/toast.js';
	import { browser } from '$app/environment';
	import { settings } from '$lib/stores/settings.js';

	/** @type {{ entry: import('$lib/shared/feed.js').FeedEntry }} */
	let { entry } = $props();

	const account = $derived($accounts.find((a) => a.id === entry.accountId));
	const accColor = $derived(stringHue(account?.displayName || entry.accountId));

	// Friend (subject of the event)
	const friend = $derived({
		id: entry.userId,
		displayName: entry.displayName || entry.userId,
		location: entry.location,
		accountIds: entry.accountId ? [entry.accountId] : []
	});

	function stringHue(s) {
		if (!s) return '0';
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
		return String(h % 360);
	}

	// Build a labeled description + clickable chips
	const chips = $derived.by(() => {
		const out = [];
		// World chip (Online, GPS, Invite)
		if (entry.worldName || entry.worldId) {
			out.push({
				key: 'world',
				label: entry.worldName || entry.worldId,
				title: entry.worldId || entry.worldName,
				location: entry.location
			});
		} else if (entry.location && entry.location !== 'offline' && entry.location !== 'private') {
			out.push({ key: 'loc', label: locationLabel(entry.location), location: entry.location });
		}
		// Avatar change: before → after (both clickable)
		if (entry.type === 'Avatar') {
			if (entry.previousCurrentAvatarThumbnailImageUrl) {
				out.push({
					key: 'avatar-prev',
					label: 'Before',
					image: entry.previousCurrentAvatarThumbnailImageUrl,
					avatarId: extractAvatarId(entry.previousCurrentAvatarImageUrl)
				});
			}
			if (entry.currentAvatarThumbnailImageUrl) {
				out.push({
					key: 'avatar-next',
					label: 'After',
					image: entry.currentAvatarThumbnailImageUrl,
					avatarId: extractAvatarId(entry.currentAvatarImageUrl)
				});
			}
		}
		return out;
	});

	function extractAvatarId(url) {
		if (!url) return null;
		const m = String(url).match(/avtr_[a-f0-9-]+/i);
		return m ? m[0] : null;
	}

	function clickUser(e) {
		if (!entry.userId || !entry.accountId) return;
		e?.stopPropagation();
		openUserDetail(entry.accountId, entry.userId);
	}

	function clickChip(chip) {
		if (chip.key === 'world' || chip.key === 'loc') {
			if (chip.worldId || chip.location) {
				openWorldDetail(chip.worldId || chip.location.split(':')[0], entry.accountId);
			}
		} else if (chip.key === 'avatar-prev' || chip.key === 'avatar-next') {
			if (chip.avatarId) {
				toasts.push(`正在搜索 ${chip.avatarId}…`, 'info');
				// Future: open a search dialog or new tab
				if (browser) window.open(`https://vrchat.com/home/avatar/${chip.avatarId}`, '_blank');
			}
		}
	}

	function onContextMenu(e) {
		if (!entry.userId || !entry.accountId) return;
		e.preventDefault();
		const items = [
			{ icon: '👤', label: '查看详情', action: () => openUserDetail(entry.accountId, entry.userId) },
			{ divider: true },
			{
				icon: '📋',
				label: '复制显示名',
				action: () => copyText(entry.displayName || entry.userId)
			},
			{
				icon: '🆔',
				label: '复制用户 ID',
				action: () => copyText(entry.userId)
			},
			{ divider: true },
			{
				icon: '✉️',
				label: '请求加入 TA 的实例',
				disabled: !entry.location || entry.location === 'offline' || entry.location === 'private',
				action: async () => {
					const r = await fetch(`/api/accounts/${entry.accountId}/actions`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'requestInvite', userId: entry.userId })
					});
					const j = await r.json();
					j.ok ? toasts.success('请求已发送') : toasts.error(j.error || '失败');
				}
			},
			{ divider: true },
			{
				icon: '🔕',
				label: '静音',
				action: async () => muteBlock('mute')
			},
			{
				icon: '🚫',
				label: '屏蔽',
				danger: true,
				action: async () => muteBlock('block')
			}
		];
		showContextMenu({ x: e.clientX, y: e.clientY, data: { friend, _accountId: entry.accountId }, items });
	}

	async function muteBlock(type) {
		if (type === 'block' && !confirm(`确定屏蔽 ${entry.displayName || entry.userId}?`)) return;
		const r = await fetch(`/api/accounts/${entry.accountId}/actions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: type, userId: entry.userId })
		});
		const j = await r.json();
		j.ok ? toasts.success(type === 'mute' ? '已静音' : '已屏蔽') : toasts.error(j.error || '失败');
	}

	async function copyText(s) {
		if (!s || !browser) return;
		navigator.clipboard.writeText(s).then(
			() => toasts.success('已复制'),
			() => toasts.error('复制失败')
		);
	}

	function clickWorldHead() {
		if (entry.location && entry.location !== 'offline' && entry.location !== 'private') {
			const worldId = entry.worldId || entry.location.split(':')[0];
			if (worldId) openWorldDetail(worldId, entry.accountId);
		}
	}
</script>

<div
	class="entry"
	role="button"
	tabindex="0"
	onclick={clickUser}
	oncontextmenu={onContextMenu}
	onkeydown={(e) => { if (e.key === 'Enter') clickUser(); }}
>
	<button
		class="avatar"
		style:--hue={accColor}
		title={account?.displayName || entry.accountDisplayName || '账号'}
		onclick={(e) => { e.stopPropagation(); /* future: open account detail */ }}
	>
		{#if account?.currentUser?.currentAvatarThumbnailImageUrl}
			<img src={account.currentUser.currentAvatarThumbnailImageUrl} alt="" loading="lazy" />
		{:else}
			<span>{(account?.displayName || '?').slice(0, 1).toUpperCase()}</span>
		{/if}
		<span class="account-pip" title={account?.displayName || entry.accountDisplayName}>
			{account?.displayName?.slice(0, 1).toUpperCase() || '?'}
		</span>
	</button>

	<div class="body">
		<div class="head-row">
			<EventIcon type={entry.type} />
			{#if entry.userId}
				<button class="user-name" onclick={clickUser} title={entry.userId}>
					{entry.displayName || entry.userId}
				</button>
			{:else}
				<span class="head">{entry.displayName || 'Someone'}</span>
			{/if}

			{#if entry.type === 'Online'}
				<span class="sep">上线</span>
				{#if entry.location && entry.location !== 'offline' && entry.location !== 'private'}
					<button class="chip world-chip" title={entry.location} onclick={clickWorldHead}>
						→ {entry.worldName || entry.worldId || locationLabel(entry.location)}
					</button>
				{/if}
			{:else if entry.type === 'Offline'}
				<span class="sep">离线了</span>
			{:else if entry.type === 'Active'}
				<span class="sep">变成了 Active</span>
			{:else if entry.type === 'GPS'}
				<span class="sep">移动到了</span>
				{#if entry.location && entry.location !== 'offline' && entry.location !== 'private'}
					<button class="chip world-chip" title={entry.location} onclick={clickWorldHead}>
						{entry.worldName || entry.worldId || locationLabel(entry.location)}
					</button>
				{/if}
				{#if entry.previousLocation}
					<span class="faint small">(从 {locationLabel(entry.previousLocation)})</span>
				{/if}
			{:else if entry.type === 'Status'}
				<span class="sep">状态变更</span>
				<span class="status-flow">
					{entry.previousStatus} → {entry.status}
				</span>
			{:else if entry.type === 'Bio'}
				<span class="sep">更新了 Bio</span>
			{:else if entry.type === 'Avatar'}
				<span class="sep">切换了模型</span>
				{#if entry.avatarName}
					<span class="muted">→ {entry.avatarName}</span>
				{/if}
			{:else if entry.type === 'FriendRequest'}
				<span class="sep">发送了好友请求</span>
				{#if entry.detail}
					<span class="muted">{entry.detail}</span>
				{/if}
			{:else if entry.type === 'Invite'}
				<span class="sep">发送了邀请</span>
				{#if entry.worldName}
					<button class="chip world-chip" title={entry.location} onclick={clickWorldHead}>
						({entry.worldName})
					</button>
				{/if}
				{#if entry.detail}
					<span class="muted">{entry.detail}</span>
				{/if}
			{:else if entry.type === 'Instance.Closed'}
				<span class="sep">实例已关闭</span>
				{#if entry.location}
					<span class="muted">{entry.location}</span>
				{/if}
			{:else}
				<span class="sep">{entry.type}</span>
				{#if entry.detail}
					<span class="muted">{entry.detail}</span>
				{/if}
			{/if}
		</div>

		{#if entry.type === 'Avatar'}
			<div class="avatar-change">
				{#if entry.previousCurrentAvatarThumbnailImageUrl}
					<button
						class="avi prev"
						title="查看旧模型"
						onclick={(e) => { e.stopPropagation(); clickChip({ key: 'avatar-prev', avatarId: extractAvatarId(entry.previousCurrentAvatarImageUrl) }); }}
					>
						<img src={entry.previousCurrentAvatarThumbnailImageUrl} alt="" loading="lazy" />
						<span class="lbl">Before</span>
					</button>
				{/if}
				<div class="arrow">→</div>
				{#if entry.currentAvatarThumbnailImageUrl}
					<button
						class="avi next"
						title="查看新模型"
						onclick={(e) => { e.stopPropagation(); clickChip({ key: 'avatar-next', avatarId: extractAvatarId(entry.currentAvatarImageUrl) }); }}
					>
						<img src={entry.currentAvatarThumbnailImageUrl} alt="" loading="lazy" />
						<span class="lbl">After</span>
					</button>
				{/if}
			</div>
		{/if}

		{#if entry.type === 'Status' && (entry.statusDescription || entry.previousStatusDescription)}
			<div class="detail">
				{entry.previousStatusDescription || ''} → {entry.statusDescription || ''}
			</div>
		{:else if entry.type === 'Bio' && entry.bio}
			<div class="detail">{entry.bio.length > 200 ? entry.bio.slice(0, 200) + '…' : entry.bio}</div>
		{/if}

		<div class="meta">
			<span class="acc" title={account?.username || ''}>
				via {entry.accountDisplayName || account?.displayName || entry.accountId.slice(0, 8)}
			</span>
			<span class="dot">·</span>
			<span class="ago" title={entry.created_at}>{timeAgo(entry.created_at)}</span>
			<span class="faint">({formatTime(entry.created_at)})</span>
		</div>
	</div>
</div>

<style>
	.entry {
		display: flex;
		gap: 12px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
		transition: background 0.12s;
		cursor: pointer;
	}
	.entry:hover {
		background: rgba(255, 255, 255, 0.02);
	}
	.entry:focus-visible {
		background: rgba(124, 92, 255, 0.08);
		outline: none;
	}
	.avatar {
		position: relative;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: hsl(var(--hue), 50%, 40%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: 600;
		flex-shrink: 0;
		overflow: visible;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
	}
	.account-pip {
		position: absolute;
		right: -4px;
		bottom: -4px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--bg-3);
		color: var(--text);
		font-size: 10px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--bg-1);
	}
	.body {
		flex: 1;
		min-width: 0;
	}
	.head-row {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
		font-size: 13px;
	}
	.head {
		font-weight: 500;
		color: var(--text);
	}
	.user-name {
		font: inherit;
		font-weight: 600;
		color: var(--text);
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.user-name:hover {
		color: var(--accent);
		text-decoration: underline;
	}
	.sep {
		color: var(--text-dim);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 8px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		font-size: 12px;
		cursor: pointer;
		max-width: 280px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: white;
	}
	.world-chip {
		max-width: 240px;
	}
	.status-flow {
		color: var(--text);
		font-weight: 500;
	}
	.detail {
		margin-top: 4px;
		color: var(--text-dim);
		font-size: 13px;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.meta {
		margin-top: 4px;
		font-size: 11px;
		color: var(--text-faint);
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.meta .acc {
		color: var(--text-dim);
	}
	.avatar-change {
		margin-top: 8px;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.avi {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 4px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
	}
	.avi:hover {
		background: var(--bg-3);
		border-color: var(--border-strong);
	}
	.avi img {
		width: 72px;
		height: 72px;
		border-radius: 6px;
		object-fit: cover;
	}
	.avi .lbl {
		font-size: 10px;
		color: var(--text-faint);
	}
	.arrow {
		color: var(--text-dim);
		font-size: 18px;
	}
	.dot {
		opacity: 0.4;
	}
	.muted {
		color: var(--text-dim);
	}
	.faint {
		color: var(--text-faint);
	}
	.small {
		font-size: 11px;
	}
</style>
