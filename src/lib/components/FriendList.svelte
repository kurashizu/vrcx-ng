<script>
	import {
		friendsData,
		filteredFriends,
		friendSearch,
		friendGroupFilter,
		friendAccountFilter
	} from '$lib/stores/friends.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { timeAgo, locationLabel } from '$lib/shared/format.js';
	import { showContextMenu } from '$lib/stores/contextMenu.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { toasts } from '$lib/stores/toast.js';

	function onContextMenu(e, f) {
		e.preventDefault();
		const accountId = f.accountIds[0] || ($accounts[0]?.id);
		const items = buildMenu(f, accountId);
		showContextMenu({ x: e.clientX, y: e.clientY, data: { ...f, _accountId: accountId }, items });
	}

	function buildMenu(f, accountId) {
		const isOnline = f.state === 'online' && f.location && f.location !== 'offline' && f.location !== 'private';
		return [
			{ icon: '👤', label: '查看详情', action: () => openUserDetail(accountId, f.id) },
			{ divider: true },
			{
				icon: '✉️',
				label: '请求加入 TA 的实例',
				disabled: !isOnline,
				action: async () => {
					const r = await fetch(`/api/accounts/${accountId}/actions`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'requestInvite', userId: f.id })
					});
					const j = await r.json();
					j.ok ? toasts.success('请求已发送') : toasts.error(j.error || '失败');
				}
			},
			{
				icon: '🔗',
				label: '复制实例链接',
				disabled: !isOnline,
				action: () => {
					const url = `https://vrchat.com/home/launch?worldId=${encodeURIComponent(f.location.split(':')[0])}&instanceId=${encodeURIComponent(f.location.split(':')[1] || '')}`;
					navigator.clipboard.writeText(url).then(
						() => toasts.success('已复制实例链接'),
						() => toasts.error('复制失败')
					);
				}
			},
			{ divider: true },
			{
				icon: '🔕',
				label: '静音',
				action: async () => {
					const r = await fetch(`/api/accounts/${accountId}/actions`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'mute', userId: f.id })
					});
					const j = await r.json();
					j.ok ? toasts.success('已静音') : toasts.error(j.error || '失败');
				}
			},
			{
				icon: '🚫',
				label: '屏蔽',
				danger: true,
				action: async () => {
					if (!confirm(`确定屏蔽 ${f.displayName}?`)) return;
					const r = await fetch(`/api/accounts/${accountId}/actions`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'block', userId: f.id })
					});
					const j = await r.json();
					j.ok ? toasts.success('已屏蔽') : toasts.error(j.error || '失败');
				}
			},
			{ divider: true },
			{
				icon: '📋',
				label: '复制显示名',
				action: () => {
					navigator.clipboard.writeText(f.displayName).then(
						() => toasts.success('已复制'),
						() => toasts.error('复制失败')
					);
				}
			},
			{
				icon: '🆔',
				label: '复制用户 ID',
				action: () => {
					navigator.clipboard.writeText(f.id).then(
						() => toasts.success('已复制'),
						() => toasts.error('复制失败')
					);
				}
			},
			{
				icon: '🌐',
				label: '在浏览器中打开主页',
				action: () => window.open(`https://vrchat.com/home/user/${f.id}`, '_blank')
			}
		];
	}

	const platformIcon = {
		standalonewindows: '🖥️',
		android: '📱',
		ios: '📱',
		web: '🌐'
	};
	const statusIcon = {
		active: '🔵',
		'join me': '🟢',
		busy: '🔴',
		'ask me': '🟡',
		offline: '⚫'
	};

	const groupTabs = [
		{ id: 'all', label: '全部' },
		{ id: 'online', label: '在线' },
		{ id: 'active', label: 'Active' },
		{ id: 'offline', label: '离线' }
	];

	function accountLabel(id) {
		const a = $accounts.find((x) => x.id === id);
		return a?.displayName || id.slice(0, 6);
	}

	function worldName(loc) {
		if (!loc) return '';
		if (loc === 'private') return 'Private World';
		if (loc === 'offline') return '';
		const [worldId, instanceId] = loc.split(':');
		if (!instanceId || instanceId === '0') return worldId;
		return `${worldId} · ${instanceId}`;
	}
</script>

<aside class="friend-list">
	<header>
		<div class="title">
			<span>好友 ({$friendsData.total})</span>
			<span class="counts">
				<span class="dot online" title="在线"></span>
				{$friendsData.online.length}
				<span class="dot active" title="Active"></span>
				{$friendsData.active.length}
				<span class="dot offline" title="离线"></span>
				{$friendsData.offline.length}
			</span>
		</div>
	</header>

	<div class="filters">
		<input
			type="search"
			placeholder="搜索好友、世界…"
			bind:value={$friendSearch}
			class="search"
		/>

		<div class="tabs">
			{#each groupTabs as t}
				<button
					class="tab"
					class:on={$friendGroupFilter === t.id}
					onclick={() => friendGroupFilter.set(t.id)}
				>
					{t.label}
				</button>
			{/each}
		</div>

		{#if $accounts.length > 1}
			<select bind:value={$friendAccountFilter} class="account-select">
				<option value={null}>所有账号</option>
				{#each $accounts as a (a.id)}
					<option value={a.id}>{a.displayName}</option>
				{/each}
			</select>
		{/if}
	</div>

	<div class="groups">
		{#if $friendGroupFilter === 'all' || $friendGroupFilter === 'online'}
			{#if $filteredFriends.online.length > 0}
				<section class="group">
					<header><span class="dot online"></span> 在线 ({$filteredFriends.online.length})</header>
					{#each $filteredFriends.online as f (f.id)}
						<div
							class="friend online"
							oncontextmenu={(e) => onContextMenu(e, f)}
							role="button"
							tabindex="0"
							onkeydown={(e) => {
								if (e.key === 'Enter') openUserDetail(f.accountIds[0], f.id);
							}}
						>
							<div class="avatar">
								{#if f.currentAvatarThumbnailImageUrl}
									<img src={f.currentAvatarThumbnailImageUrl} alt="" loading="lazy" />
								{:else}
									<span>{f.displayName.slice(0, 1).toUpperCase()}</span>
								{/if}
								<span class="state online" title="在线"></span>
							</div>
							<div class="info">
								<div class="name-row">
									<span class="name">{f.displayName}</span>
									<span class="platform" title={f.platform}>
										{platformIcon[f.platform?.toLowerCase()] || ''}
									</span>
								</div>
								<div class="sub" title={f.location}>
									{worldName(f.location) || '未知世界'}
								</div>
								<div class="meta">
									{#if f.status && statusIcon[f.status]}
										<span class="status-pill" data-s={f.status}>
											{statusIcon[f.status]} {f.status}
										</span>
									{/if}
									{#if f.accountIds.length > 0}
										<span class="via" title={f.accountIds.map(accountLabel).join(', ')}>
											via {f.accountIds.map(accountLabel).join(', ')}
										</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</section>
			{/if}
		{/if}

		{#if $friendGroupFilter === 'all' || $friendGroupFilter === 'active'}
			{#if $filteredFriends.active.length > 0}
				<section class="group">
					<header><span class="dot active"></span> Active ({$filteredFriends.active.length})</header>
					{#each $filteredFriends.active as f (f.id)}
						<div
							class="friend active"
							oncontextmenu={(e) => onContextMenu(e, f)}
							role="button"
							tabindex="0"
							onkeydown={(e) => {
								if (e.key === 'Enter') openUserDetail(f.accountIds[0], f.id);
							}}
						>
							<div class="avatar">
								{#if f.currentAvatarThumbnailImageUrl}
									<img src={f.currentAvatarThumbnailImageUrl} alt="" loading="lazy" />
								{:else}
									<span>{f.displayName.slice(0, 1).toUpperCase()}</span>
								{/if}
								<span class="state active" title="Active"></span>
							</div>
							<div class="info">
								<div class="name-row">
									<span class="name">{f.displayName}</span>
									<span class="platform">{platformIcon[f.platform?.toLowerCase()] || ''}</span>
								</div>
								<div class="sub muted">在 VRChat 桌面客户端中</div>
								{#if f.accountIds.length > 0}
									<div class="meta">
										<span class="via">via {f.accountIds.map(accountLabel).join(', ')}</span>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</section>
			{/if}
		{/if}

		{#if $friendGroupFilter === 'all' || $friendGroupFilter === 'offline'}
			{#if $filteredFriends.offline.length > 0}
				<section class="group">
					<header>
						<span class="dot offline"></span> 离线 ({$filteredFriends.offline.length})
					</header>
					{#each $filteredFriends.offline.slice(0, 100) as f (f.id)}
						<div
							class="friend offline"
							oncontextmenu={(e) => onContextMenu(e, f)}
							role="button"
							tabindex="0"
							onkeydown={(e) => {
								if (e.key === 'Enter') openUserDetail(f.accountIds[0], f.id);
							}}
						>
							<div class="avatar">
								{#if f.currentAvatarThumbnailImageUrl}
									<img src={f.currentAvatarThumbnailImageUrl} alt="" loading="lazy" />
								{:else}
									<span>{f.displayName.slice(0, 1).toUpperCase()}</span>
								{/if}
								<span class="state offline"></span>
							</div>
							<div class="info">
								<div class="name-row">
									<span class="name">{f.displayName}</span>
									<span class="platform">{platformIcon[f.last_platform?.toLowerCase()] || ''}</span>
								</div>
								<div class="sub muted">
									{f.lastSeen ? `${timeAgo(new Date(f.lastSeen).toISOString())}离线` : '离线'}
								</div>
							</div>
						</div>
					{/each}
					{#if $filteredFriends.offline.length > 100}
						<div class="more">… 还有 {$filteredFriends.offline.length - 100} 个离线好友</div>
					{/if}
				</section>
			{/if}
		{/if}

		{#if $friendsData.total === 0}
			<div class="empty">
				<p>好友列表为空</p>
				<p class="muted small">
					登录账号后会自动拉取好友列表。拉取后会在此显示，包括在线状态和所在世界。
				</p>
			</div>
		{:else if $filteredFriends.total === 0}
			<div class="empty">
				<p class="muted">没有匹配的好友</p>
			</div>
		{/if}
	</div>
</aside>

<style>
	.friend-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-1);
		border-left: 1px solid var(--border);
		min-height: 0;
	}
	header {
		padding: 14px 14px 8px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
	}
	.counts {
		display: flex;
		gap: 4px;
		align-items: center;
		font-size: 11px;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-faint);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--offline);
		display: inline-block;
	}
	.dot.online {
		background: var(--online);
	}
	.dot.active {
		background: var(--active);
	}
	.counts .dot {
		margin-left: 6px;
	}
	.counts .dot:first-of-type {
		margin-left: 0;
	}
	.filters {
		padding: 8px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-bottom: 1px solid var(--border);
	}
	.search {
		font-size: 12px;
		padding: 6px 8px;
	}
	.tabs {
		display: flex;
		gap: 2px;
		background: var(--bg-2);
		border-radius: 8px;
		padding: 2px;
	}
	.tab {
		flex: 1;
		padding: 4px 6px;
		font-size: 11px;
		background: transparent;
		border: none;
		color: var(--text-dim);
		border-radius: 6px;
	}
	.tab:hover {
		background: var(--bg-3);
		color: var(--text);
	}
	.tab.on {
		background: var(--bg-3);
		color: var(--text);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}
	.account-select {
		font-size: 12px;
		padding: 4px 8px;
	}
	.groups {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0 20px;
	}
	.group {
		margin-bottom: 4px;
	}
	.group > header {
		padding: 8px 14px 4px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		display: flex;
		align-items: center;
		gap: 6px;
		border-bottom: none;
	}
	.friend {
		display: flex;
		gap: 10px;
		padding: 6px 12px;
		margin: 1px 6px;
		border-radius: 6px;
		cursor: default;
	}
	.friend:hover {
		background: var(--bg-2);
	}
	.friend:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.avatar {
		position: relative;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 13px;
		color: var(--text);
		flex-shrink: 0;
		overflow: hidden;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.state {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid var(--bg-1);
	}
	.state.online {
		background: var(--online);
	}
	.state.active {
		background: var(--active);
	}
	.state.offline {
		background: var(--offline);
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.name-row {
		display: flex;
		gap: 4px;
		align-items: center;
		justify-content: space-between;
	}
	.name {
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.platform {
		font-size: 13px;
		opacity: 0.7;
	}
	.sub {
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub.muted {
		color: var(--text-faint);
		font-style: italic;
	}
	.meta {
		margin-top: 2px;
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.status-pill {
		font-size: 10px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--bg-3);
		color: var(--text-dim);
	}
	.status-pill[data-s='active'] {
		background: rgba(31, 184, 255, 0.15);
		color: var(--active);
	}
	.status-pill[data-s='join me'] {
		background: rgba(61, 220, 151, 0.15);
		color: var(--online);
	}
	.status-pill[data-s='busy'] {
		background: rgba(255, 93, 108, 0.15);
		color: var(--danger);
	}
	.status-pill[data-s='ask me'] {
		background: rgba(255, 180, 84, 0.15);
		color: var(--warn);
	}
	.via {
		font-size: 10px;
		color: var(--text-faint);
	}
	.empty {
		text-align: center;
		padding: 40px 16px;
		color: var(--text-dim);
	}
	.empty p {
		margin: 0 0 8px;
	}
	.empty p.small {
		font-size: 12px;
		line-height: 1.5;
	}
	.more {
		text-align: center;
		padding: 8px;
		font-size: 11px;
		color: var(--text-faint);
	}
	.muted {
		color: var(--text-faint);
	}
</style>
