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
	import { trustColor, vrcLaunchUrl } from '$lib/shared/trust.js';
	import { settings } from '$lib/stores/settings.js';
	import { browser } from '$app/environment';

	// view modes
	let viewMode = $state('flat'); // 'flat' | 'instance' | 'world'

	const VIEW_MODES = [
		{ id: 'flat', label: '列表', icon: '☰' },
		{ id: 'instance', label: '实例', icon: '🧩' },
		{ id: 'world', label: '世界', icon: '🌍' }
	];

	// Trust rank → CSS class (when ui.trustColors is on)
	function trustClass(f) {
		if (!$settings['ui.trustColors']) return '';
		return trustColor(f) || '';
	}

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

	function parseLocation(loc) {
		if (!loc || loc === 'offline' || loc === 'private') return null;
		const [worldId, instanceId] = loc.split(':');
		return { worldId, instanceId: instanceId || '0' };
	}

	/**
	 * Display label for a friend's current location.
	 * Priority: cached worldName > truncated worldId.
	 * @param {{ worldName?: string, worldId?: string, location?: string }} f
	 * @param {boolean} [showInstance]  include instance id in label
	 */
	function displayWorld(f, showInstance = false) {
		if (!f) return '未知世界';
		const loc = f.location || '';
		if (loc === 'private') return 'Private World';
		if (!loc || loc === 'offline') return '';
		const parsed = parseLocation(loc);
		if (!parsed) return '未知世界';
		const name = f.worldName || parsed.worldId;
		const shortId = parsed.worldId.length > 16
			? parsed.worldId.slice(0, 8) + '…' + parsed.worldId.slice(-4)
			: parsed.worldId;
		const label = f.worldName ? name : shortId;
		if (!showInstance) return label;
		if (!parsed.instanceId || parsed.instanceId === '0') return label;
		return `${label} · ${parsed.instanceId}`;
	}

	/**
	 * Group online friends by location according to current viewMode.
	 * Returns an array of { key, label, location, friends } sorted by size desc.
	 */
	function groupOnline(list) {
		if (viewMode === 'flat') return null;
		const groups = new Map();
		for (const f of list) {
			const loc = f.location || '';
			if (!loc || loc === 'offline' || loc === 'private') {
				const key = 'private';
				if (!groups.has(key)) groups.set(key, { key, label: 'Private / Unknown', friends: [] });
				groups.get(key).friends.push(f);
				continue;
			}
			const parsed = parseLocation(loc);
			if (!parsed) continue;
			let key;
			if (viewMode === 'instance') {
				key = loc; // full location
			} else {
				key = parsed.worldId; // world only
			}
			if (!groups.has(key)) {
				const shortId = parsed.worldId.length > 16
					? parsed.worldId.slice(0, 8) + '…' + parsed.worldId.slice(-4)
					: parsed.worldId;
				groups.set(key, {
					key,
					label: viewMode === 'instance' ? loc : (f.worldName || shortId),
					location: loc,
					worldName: f.worldName,
					worldId: parsed.worldId,
					friends: []
				});
			} else {
				// First friend had no worldName cached yet — keep the better label
				const g = groups.get(key);
				if (!g.worldName && f.worldName) {
					g.worldName = f.worldName;
					g.label = f.worldName;
				}
			}
			groups.get(key).friends.push(f);
		}
		return [...groups.values()].sort((a, b) => b.friends.length - a.friends.length);
	}

	function launchVrc(location) {
		const u = vrcLaunchUrl(location);
		if (!u) {
			toasts.error('无法生成启动链接');
			return;
		}
		if (browser) window.location.href = u;
	}

	// Reusable friend row snippet
</script>

{#snippet friendRow(f)}
	<div
		class="friend {f.state}"
		class:trust-color={!!trustClass(f)}
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
			<span class="state {f.state}" title={f.state === 'online' ? '在线' : f.state === 'active' ? 'Active' : '离线'}></span>
		</div>
		<div class="info">
			<div class="name-row">
				<span class="name {trustClass(f)}">{f.displayName}</span>
				<span class="platform" title={f.platform}>
					{platformIcon[f.platform?.toLowerCase()] || ''}
				</span>
				{#if f.state === 'online' && f.location && f.location !== 'offline' && f.location !== 'private'}
					<button
						class="launch"
						title="在 VRChat 中打开该实例"
						onclick={(e) => { e.stopPropagation(); launchVrc(f.location); }}
					>↗</button>
				{/if}
			</div>
			<div class="sub" title={f.location}>
				{#if f.state === 'online'}
					{displayWorld(f, $settings['ui.showInstanceId'])}
				{:else if f.state === 'active'}
					<span class="muted">在 VRChat 桌面客户端中</span>
				{:else}
					<span class="muted">{f.lastSeen ? `${timeAgo(new Date(f.lastSeen).toISOString())} 离线` : '离线'}</span>
				{/if}
			</div>
			<div class="meta">
				{#if f.state === 'online' && f.status && statusIcon[f.status]}
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
{/snippet}

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

		{#if $friendGroupFilter !== 'offline'}
			<div class="view-tabs">
				{#each VIEW_MODES as v}
					<button
						class="view-tab"
						class:on={viewMode === v.id}
						title={v.label}
						onclick={() => (viewMode = v.id)}
					>
						<span class="ico">{v.icon}</span>
						<span>{v.label}</span>
					</button>
				{/each}
			</div>
		{/if}

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
				{#if groupOnline($filteredFriends.online)}
					{#each groupOnline($filteredFriends.online) as g (g.key)}
						<section class="group">
							<header>
								<span class="dot online"></span>
								<span class="group-label" title={g.label}>{g.label}</span>
								<span class="group-count">{g.friends.length}</span>
								{#if viewMode === 'instance' && g.location && g.location !== 'private'}
									<button
										class="launch-mini"
										title="加入该实例"
										onclick={() => launchVrc(g.location)}
									>↗</button>
								{/if}
							</header>
							{#each g.friends as f (f.id)}
								{@render friendRow(f)}
							{/each}
						</section>
					{/each}
				{:else}
					<section class="group">
						<header><span class="dot online"></span> 在线 ({$filteredFriends.online.length})</header>
						{#each $filteredFriends.online as f (f.id)}
							{@render friendRow(f)}
						{/each}
					</section>
				{/if}
			{/if}
		{/if}

		{#if $friendGroupFilter === 'all' || $friendGroupFilter === 'active'}
			{#if $filteredFriends.active.length > 0}
				<section class="group">
					<header><span class="dot active"></span> Active ({$filteredFriends.active.length})</header>
					{#each $filteredFriends.active as f (f.id)}
						{@render friendRow(f)}
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
					{#each $filteredFriends.offline as f (f.id)}
						{@render friendRow(f)}
					{/each}
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
	.view-tabs {
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--bg-2);
		border-radius: 8px;
	}
	.view-tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 4px 6px;
		font-size: 11px;
		background: transparent;
		border: none;
		color: var(--text-dim);
		border-radius: 6px;
	}
	.view-tab:hover {
		background: var(--bg-3);
		color: var(--text);
	}
	.view-tab.on {
		background: var(--accent);
		color: white;
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
	.group > header .group-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-transform: none;
		letter-spacing: 0;
		font-size: 12px;
		color: var(--text-dim);
		font-weight: 500;
	}
	.group > header .group-count {
		font-size: 10px;
		background: var(--bg-3);
		padding: 1px 6px;
		border-radius: 8px;
		color: var(--text-faint);
	}
	.launch,
	.launch-mini {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-dim);
		padding: 0;
		cursor: pointer;
		border-radius: 6px;
		font-size: 12px;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
	}
	.launch {
		width: 22px;
		height: 22px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.launch-mini {
		width: 22px;
		height: 22px;
		font-size: 11px;
	}
	.launch:hover,
	.launch-mini:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: white;
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
