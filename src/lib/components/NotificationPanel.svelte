<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { accounts } from '$lib/stores/accounts.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { openWorldDetail } from '$lib/stores/worldDetail.js';
	import { toasts } from '$lib/stores/toast.js';
	import { parseLocation, shortInstanceLabel } from '$lib/shared/location.js';

	let { open = $bindable(false) } = $props();

	let items = $state([]);
	let loading = $state(false);
	let accountFilter = $state('');

	async function refresh() {
		loading = true;
		try {
			const r = await fetch('/api/notifications?limit=200' + (accountFilter ? `&accountId=${encodeURIComponent(accountFilter)}` : ''));
			const j = await r.json();
			items = j.notifications || [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open && browser) refresh();
	});

	async function seen(id) {
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'seen', id })
		});
		items = items.map((it) => (it.id === id ? { ...it, seenAt: Date.now() } : it));
	}

	async function dismiss(id) {
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'dismiss', id })
		});
		items = items.filter((it) => it.id !== id);
	}

	async function dismissAll() {
		if (!confirm('清空所有通知？')) return;
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'dismiss', accountId: accountFilter || undefined })
		});
		items = [];
	}

	function launch(loc) {
		const worldId = (loc || '').split(':')[0];
		if (worldId) openWorldDetail(worldId, accountFilter || undefined);
		else toasts.error('无法启动实例');
	}

	function timeAgo(ts) {
		if (!ts) return '';
		const d = new Date(ts);
		const diff = Date.now() - d.getTime();
		if (diff < 60000) return '刚刚';
		if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
		return `${Math.floor(diff / 86400000)} 天前`;
	}

	const TYPE_ICON = {
		friendRequest: '🤝',
		invite: '✉️',
		requestInvite: '✉️',
		message: '💬',
		groupAnnouncement: '📢'
	};
	const TYPE_LABEL = {
		friendRequest: '好友请求',
		invite: '实例邀请',
		requestInvite: '请求加入',
		message: '消息',
		groupAnnouncement: '群公告'
	};

	function accName(id) {
		const a = $accounts.find((x) => x.id === id);
		return a?.displayName || id.slice(0, 6);
	}

	function categoryColor(cat) {
		return {
			social: 'var(--online)',
			invite: 'var(--accent)',
			request: 'var(--warn)',
			group: 'var(--active)',
			message: 'var(--text-dim)',
			other: 'var(--text-faint)'
		}[cat] || 'var(--text-faint)';
	}

	// Auto-refresh every 10s when open
	let timer;
	$effect(() => {
		if (open && browser) {
			timer = setInterval(refresh, 10000);
			return () => clearInterval(timer);
		}
	});
</script>

{#if open}
	<div
		class="backdrop"
		onclick={() => (open = false)}
		role="button"
		tabindex="-1"
		onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
	></div>
	<aside class="panel" role="dialog" aria-label="通知">
		<header>
			<h2>通知</h2>
			<button class="ghost" onclick={refresh} title="刷新">↻</button>
			<button class="ghost danger" onclick={dismissAll} disabled={items.length === 0}>清空</button>
			<button class="ghost close" onclick={() => (open = false)}>✕</button>
		</header>

		<div class="filters">
			<select bind:value={accountFilter} onchange={refresh}>
				<option value="">所有账号</option>
				{#each $accounts as a (a.id)}
					<option value={a.id}>{a.displayName}</option>
				{/each}
			</select>
			<span class="count">{items.length} 条</span>
		</div>

		<div class="list">
			{#if loading && items.length === 0}
				<div class="empty">加载中…</div>
			{:else if items.length === 0}
				<div class="empty">暂无通知</div>
			{:else}
				{#each items as it (it.id)}
					<div
						class="item"
						class:unseen={!it.seenAt}
						style:--cat={categoryColor(it.category)}
					>
						<div class="cat-bar"></div>
						<div class="content">
							<div class="head-row">
								<span class="icon">{TYPE_ICON[it.type] || '🔔'}</span>
								<span class="type">{TYPE_LABEL[it.type] || it.type}</span>
								{#if !it.seenAt}<span class="badge">新</span>{/if}
								<span class="time">{timeAgo(it.createdAt)}</span>
							</div>
							<div class="from">
								来自 <strong>{it.senderDisplayName || it.senderUsername || it.senderUserId?.slice(0, 8) || '?'}</strong>
								{#if it.accountId}
									<span class="via">via {accName(it.accountId)}</span>
								{/if}
							</div>
							{#if it.worldId || it.instanceId}
								<button
									class="world-chip"
									onclick={() => launch(`${it.worldId}:${it.instanceId || ''}`)}
									title="打开世界详情"
								>
									🌍 {it.worldName || '世界'}{it.instanceId ? ` · ${shortInstanceLabel(parseLocation(`${it.worldId}:${it.instanceId}`), it.senderDisplayName)}` : ''}
								</button>
							{/if}
							{#if it.message}
								<div class="message">{it.message}</div>
							{/if}
							<div class="actions">
								{#if it.senderUserId && it.accountId}
									<button class="ghost xs" onclick={() => openUserDetail(it.accountId, it.senderUserId)}>
										查看用户
									</button>
								{/if}
								{#if !it.seenAt}
									<button class="ghost xs" onclick={() => seen(it.id)}>标为已读</button>
								{/if}
								<button class="ghost xs danger" onclick={() => dismiss(it.id)}>忽略</button>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</aside>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 40;
	}
	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 420px;
		max-width: 100vw;
		background: var(--bg-1);
		border-left: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		z-index: 41;
		box-shadow: -10px 0 40px rgba(0, 0, 0, 0.4);
		animation: slide-in 0.2s ease;
	}
	@keyframes slide-in {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}
	header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
	}
	header h2 {
		flex: 1;
		margin: 0;
		font-size: 16px;
	}
	header button {
		padding: 4px 8px;
		font-size: 12px;
	}
	header .close {
		font-size: 14px;
	}
	.filters {
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 8px 16px;
		border-bottom: 1px solid var(--border);
	}
	.filters select {
		flex: 1;
		padding: 6px 8px;
		font-size: 12px;
	}
	.filters .count {
		font-size: 11px;
		color: var(--text-dim);
	}
	.list {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
	}
	.empty {
		padding: 40px;
		text-align: center;
		color: var(--text-dim);
		font-size: 13px;
	}
	.item {
		position: relative;
		display: flex;
		gap: 8px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		transition: background 0.12s;
	}
	.item:hover {
		background: var(--bg-2);
	}
	.item.unseen {
		background: rgba(124, 92, 255, 0.05);
	}
	.cat-bar {
		width: 3px;
		background: var(--cat);
		border-radius: 2px;
		flex-shrink: 0;
	}
	.content {
		flex: 1;
		min-width: 0;
	}
	.head-row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-dim);
	}
	.head-row .icon {
		font-size: 14px;
	}
	.head-row .type {
		font-weight: 600;
		color: var(--text);
	}
	.head-row .badge {
		font-size: 10px;
		background: var(--accent);
		color: white;
		padding: 0 5px;
		border-radius: 8px;
	}
	.head-row .time {
		margin-left: auto;
		font-size: 11px;
		color: var(--text-faint);
	}
	.from {
		font-size: 13px;
		margin-top: 4px;
	}
	.from .via {
		color: var(--text-faint);
		font-size: 11px;
		margin-left: 6px;
	}
	.world-chip {
		display: inline-block;
		margin-top: 6px;
		padding: 2px 8px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 12px;
		color: var(--text);
		cursor: pointer;
	}
	.world-chip:hover {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	.message {
		margin-top: 6px;
		font-size: 12px;
		color: var(--text-dim);
		padding: 6px 8px;
		background: var(--bg-2);
		border-radius: 6px;
		border-left: 2px solid var(--border-strong);
	}
	.actions {
		display: flex;
		gap: 4px;
		margin-top: 8px;
	}
	.actions .xs {
		padding: 3px 8px;
		font-size: 11px;
	}
	button.danger {
		color: var(--danger);
	}
</style>
