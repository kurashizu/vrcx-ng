<script>
	import { accounts } from '$lib/stores/accounts.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { toasts } from '$lib/stores/toast.js';
	import { timeAgo } from '$lib/shared/format.js';

	const TYPES = [
		{ id: 'mute', label: '静音', icon: '🔇', color: 'warn' },
		{ id: 'block', label: '拉黑', icon: '⛔', color: 'danger' }
	];

	let selectedAccountId = $state('');
	let activeTab = $state('mute'); // 'mute' | 'block'
	let entries = $state([]);
	let busy = $state(false);
	let source = $state('');
	let errorMsg = $state('');

	$effect(() => {
		const loggedIn = $accounts.filter((a) => a.loggedIn);
		if (!selectedAccountId && loggedIn.length > 0) {
			selectedAccountId = loggedIn[0].id;
		}
	});

	$effect(() => {
		if (selectedAccountId && activeTab) loadList();
	});

	async function loadList() {
		if (!selectedAccountId) return;
		busy = true;
		errorMsg = '';
		try {
			const r = await fetch(
				`/api/accounts/${encodeURIComponent(selectedAccountId)}/moderations?type=${activeTab}`
			);
			const j = await r.json();
			entries = j.entries || [];
			source = j.source || '';
			if (!j.ok && j.error) errorMsg = j.error;
		} catch (err) {
			errorMsg = err.message;
		} finally {
			busy = false;
		}
	}

	async function removeMod(userId) {
		if (!confirm('确定要解除 ' + (activeTab === 'mute' ? '静音' : '拉黑') + ' 吗?')) return;
		const action = activeTab === 'mute' ? 'unmute' : 'unblock';
		try {
			const r = await fetch(`/api/accounts/${encodeURIComponent(selectedAccountId)}/actions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, userId })
			});
			const j = await r.json();
			if (j.ok) {
				toasts.success('已解除');
				loadList();
			} else {
				toasts.error(j.error || '操作失败');
			}
		} catch (err) {
			toasts.error(err.message);
		}
	}

	function openUser(userId) {
		openUserDetail(selectedAccountId, userId);
	}
</script>

<svelte:head>
	<title>屏蔽管理 — vrcx-ng</title>
</svelte:head>

<main class="page">
	<header>
		<a href="/" class="back">← 返回</a>
		<div class="head-txt">
			<h1>🚫 屏蔽管理</h1>
			<p class="muted">查看和管理各个账号的静音 / 拉黑名单</p>
		</div>
	</header>

	<div class="toolbar">
		<label class="lbl">账号</label>
		<select bind:value={selectedAccountId}>
			{#each $accounts.filter((a) => a.loggedIn) as a (a.id)}
				<option value={a.id}>{a.displayName} ({a.username})</option>
			{/each}
		</select>

		<div class="tabs">
			{#each TYPES as t (t.id)}
				<button class:active={activeTab === t.id} onclick={() => (activeTab = t.id)}>
					<span class="icn">{t.icon}</span>
					<span>{t.label}</span>
				</button>
			{/each}
		</div>

		<button class="refresh ghost" onclick={loadList} disabled={busy}>
			{busy ? '⟳ 加载中' : '🔄 刷新'}
		</button>
	</div>

	{#if errorMsg}
		<div class="banner error">{errorMsg}</div>
	{/if}
	{#if source === 'cache'}
		<div class="banner hint">当前显示的是本地缓存的列表（VRChat API 暂时不可用）</div>
	{/if}

	<section class="list">
		{#if entries.length === 0 && !busy}
			<div class="empty">
				<div class="big">{TYPES.find((t) => t.id === activeTab)?.icon}</div>
				<div class="muted">没有 {TYPES.find((t) => t.id === activeTab)?.label} 的用户</div>
			</div>
		{:else}
			{#each entries as e (e.targetUserId + e.type)}
				<div class="row">
					<button class="info" onclick={() => openUser(e.targetUserId)} title="查看用户详情">
						<div class="avatar {activeTab === 'mute' ? 'warn' : 'danger'}">
							{e.targetDisplayName?.slice(0, 1).toUpperCase() || '?'}
						</div>
						<div class="name-line">
							<div class="name">{e.targetDisplayName || e.targetUserId}</div>
							<div class="userid">{e.targetUserId}</div>
						</div>
					</button>
					<div class="meta">
						<span class="when">{e.created ? timeAgo(e.created) : ''}</span>
						<span class="badge {activeTab === 'mute' ? 'warn' : 'danger'}">
							{TYPES.find((t) => t.id === activeTab)?.icon}
							{TYPES.find((t) => t.id === activeTab)?.label}
						</span>
					</div>
					<button class="ghost small" onclick={() => removeMod(e.targetUserId)}>解除</button>
				</div>
			{/each}
		{/if}
	</section>
</main>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 24px 18px 80px;
	}
	header h1 {
		margin: 0 0 4px;
		font-size: 22px;
	}
	.muted {
		color: var(--text-dim);
	}
	.toolbar {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 20px 0;
		flex-wrap: wrap;
	}
	.toolbar .lbl {
		font-size: 12px;
		color: var(--text-dim);
	}
	.toolbar select {
		font-size: 13px;
		padding: 6px 10px;
		min-width: 180px;
	}
	.tabs {
		display: flex;
		gap: 4px;
		margin-left: auto;
	}
	.tabs button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 12px;
		font-size: 13px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-dim);
		cursor: pointer;
	}
	.tabs button.active {
		background: var(--accent);
		border-color: var(--accent);
		color: white;
	}
	.refresh {
		margin-left: 4px;
	}
	.banner {
		padding: 10px 14px;
		border-radius: 8px;
		font-size: 13px;
		margin-bottom: 10px;
	}
	.banner.error {
		background: rgba(255, 93, 108, 0.1);
		color: var(--danger);
	}
	.banner.hint {
		background: rgba(124, 92, 255, 0.1);
		color: var(--accent);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.info {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		color: inherit;
	}
	.info:hover .name {
		color: var(--accent);
	}
	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 16px;
		color: white;
		flex-shrink: 0;
	}
	.avatar.warn { background: var(--warn); }
	.avatar.danger { background: var(--danger); }
	.name-line {
		min-width: 0;
		flex: 1;
	}
	.name {
		font-weight: 600;
		font-size: 14px;
		color: var(--text);
	}
	.userid {
		font-size: 11px;
		color: var(--text-dim);
		font-family: ui-monospace, monospace;
	}
	.meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		flex-shrink: 0;
	}
	.when {
		font-size: 11px;
		color: var(--text-dim);
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		font-size: 11px;
		font-weight: 600;
		border-radius: 999px;
	}
	.badge.warn { background: rgba(255, 180, 84, 0.15); color: var(--warn); }
	.badge.danger { background: rgba(255, 93, 108, 0.15); color: var(--danger); }
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 60px 20px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 12px;
	}
	.empty .big {
		font-size: 36px;
		opacity: 0.5;
	}
	button.ghost.small {
		font-size: 12px;
		padding: 4px 10px;
	}
</style>