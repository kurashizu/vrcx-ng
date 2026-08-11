<script>
	import EventIcon from './EventIcon.svelte';
	import { timeAgo, formatTime, locationLabel } from '$lib/shared/format.js';
	import { accounts } from '$lib/stores/accounts.js';

	/** @type {{ entry: import('$lib/shared/feed.js').FeedEntry }} */
	let { entry } = $props();

	const account = $derived($accounts.find((a) => a.id === entry.accountId));
	const accColor = $derived(stringHue(account?.displayName || entry.accountId));

	/**
	 * @param {string|undefined} s
	 * @returns {string}
	 */
	function stringHue(s) {
		if (!s) return '0';
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
		return String(h % 360);
	}

	const head = $derived.by(() => {
		const name = entry.displayName || entry.userId || 'Someone';
		const acc = entry.accountDisplayName || account?.displayName;
		switch (entry.type) {
			case 'Online':
				return `${name} 上线了${entry.worldName ? ` → ${entry.worldName}` : ''}`;
			case 'Offline':
				return `${name} 离线了`;
			case 'Active':
				return `${name} 变成了 Active`;
			case 'GPS':
				return `${name} 移动到了 ${entry.worldName || locationLabel(entry.location) || '新世界'}`;
			case 'Status':
				return `${name} 状态变更: ${entry.previousStatus} → ${entry.status}`;
			case 'Bio':
				return `${name} 更新了 Bio`;
			case 'Avatar':
				return `${name} 切换了模型`;
			case 'FriendRequest':
				return `${name} 发送了好友请求`;
			case 'Invite':
				return `${name} 发送了邀请${entry.worldName ? ` (${entry.worldName})` : ''}`;
			case 'Instance.Closed':
				return `实例已关闭: ${entry.location || ''}`;
			default:
				return `${name} ${entry.type}`;
		}
	});

	const detail = $derived.by(() => {
		if (entry.type === 'Status') {
			return [entry.statusDescription, entry.previousStatusDescription].filter(Boolean).join(' · ');
		}
		if (entry.type === 'Bio') {
			const b = entry.bio || '';
			return b.length > 200 ? b.slice(0, 200) + '…' : b;
		}
		if (entry.type === 'GPS' && entry.previousLocation) {
			return `from ${locationLabel(entry.previousLocation)}`;
		}
		if (entry.type === 'Instance.Closed') {
			return '';
		}
		return '';
	});
</script>

<div class="entry">
	<div class="avatar" style:--hue={accColor}>
		{#if account?.currentUser?.currentAvatarThumbnailImageUrl}
			<img src={account.currentUser.currentAvatarThumbnailImageUrl} alt="" loading="lazy" />
		{:else}
			<span>{(account?.displayName || '?').slice(0, 1).toUpperCase()}</span>
		{/if}
		<span class="account-pip" title={account?.displayName || entry.accountDisplayName}>
			{account?.displayName?.slice(0, 1).toUpperCase() || '?'}
		</span>
	</div>

	<div class="body">
		<div class="head-row">
			<EventIcon type={entry.type} />
			<span class="head">{head}</span>
		</div>

		{#if entry.type === 'Avatar'}
			<div class="avatar-change">
				{#if entry.previousCurrentAvatarThumbnailImageUrl}
					<div class="avi prev">
						<img src={entry.previousCurrentAvatarThumbnailImageUrl} alt="" loading="lazy" />
						<span class="lbl">Before</span>
					</div>
				{/if}
				<div class="arrow">→</div>
				{#if entry.currentAvatarThumbnailImageUrl}
					<div class="avi next">
						<img src={entry.currentAvatarThumbnailImageUrl} alt="" loading="lazy" />
						<span class="lbl">After</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if detail}
			<div class="detail">{detail}</div>
		{/if}

		<div class="meta">
			<span class="acc" title="via account">via {entry.accountDisplayName || account?.displayName || entry.accountId.slice(0, 8)}</span>
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
	}
	.entry:hover {
		background: rgba(255, 255, 255, 0.02);
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
		gap: 8px;
		align-items: center;
	}
	.head {
		font-weight: 500;
		color: var(--text);
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
	}
	.avi img {
		width: 72px;
		height: 72px;
		border-radius: 8px;
		object-fit: cover;
		border: 1px solid var(--border-strong);
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
</style>
