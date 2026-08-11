<script>
	import AccountList from '$lib/components/AccountList.svelte';
	import FeedFilterBar from '$lib/components/FeedFilterBar.svelte';
	import FeedItem from '$lib/components/FeedItem.svelte';
	import FriendList from '$lib/components/FriendList.svelte';
	import AddAccountDialog from '$lib/components/AddAccountDialog.svelte';
	import TwoFactorDialog from '$lib/components/TwoFactorDialog.svelte';
	import NotificationPanel from '$lib/components/NotificationPanel.svelte';
	import { filteredFeed } from '$lib/stores/feed.js';
	import { accounts, loggedInCount, onlineCount } from '$lib/stores/accounts.js';
	import { settings, getSetting, updateSetting } from '$lib/stores/settings.js';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let addOpen = $state(false);
	// mobile drawer states (left menu / right friends)
	let menuOpen = $state(false);
	let friendsOpen = $state(false);
	function closeDrawers() {
		menuOpen = false;
		friendsOpen = false;
	}
	// 'list' = traditional vertical list; 'bubbles' = full-bleed flex-wrap cards
	let feedMode = $state(getSetting('ui.feedMode') || 'bubbles');
	function setFeedMode(m) {
		feedMode = m;
		updateSetting('ui.feedMode', m);
	}
	let twofaOpen = $state(false);
	let twofaAccountId = $state('');
	let twofaMethods = $state(/** @type {string[]} */ ([]));
	let notifOpen = $state(false);
	let notifUnseen = $state(0);
	let listEl;

	async function refreshNotifCount() {
		if (!browser) return;
		try {
			const r = await fetch('/api/notifications?onlyUnseen=true&limit=500');
			const j = await r.json();
			notifUnseen = (j.notifications || []).length;
		} catch {}
	}

	function on2faEvent(e) {
		const { accountId, methods } = e.detail;
		twofaAccountId = accountId;
		twofaMethods = methods;
		twofaOpen = true;
	}

	onMount(() => {
		window.addEventListener('vrc-2fa-required', on2faEvent);
		refreshNotifCount();
		const id = setInterval(refreshNotifCount, 15000);
		return () => {
			window.removeEventListener('vrc-2fa-required', on2faEvent);
			clearInterval(id);
		};
	});
</script>

<svelte:head>
	<title>vrcx-ng · 多账号动态</title>
</svelte:head>

<div class="app" class:menu-open={menuOpen} class:friends-open={friendsOpen}>
	<div class="mobile-topbar">
		<button class="mob-btn" onclick={() => (menuOpen = !menuOpen)} aria-label="菜单" title="菜单">☰</button>
		<span class="mob-title">vrcx-ng</span>
		<button class="mob-btn" onclick={() => (friendsOpen = !friendsOpen)} aria-label="好友" title="好友">👥</button>
	</div>
	<aside class="sidebar" class:open={menuOpen}>
		<div class="brand">
			<div class="logo">V</div>
			<div>
				<div class="brand-name">vrcx-ng</div>
				<div class="brand-sub">多账号动态聚合</div>
			</div>
		</div>
		<div class="stats">
			<div class="stat">
				<div class="num">{$accounts.length}</div>
				<div class="lbl">账号</div>
			</div>
			<div class="stat">
				<div class="num">{$loggedInCount}</div>
				<div class="lbl">已登录</div>
			</div>
			<div class="stat">
				<div class="num online">{$onlineCount}</div>
				<div class="lbl">Live</div>
			</div>
		</div>
		<div class="account-scroll">
			<AccountList onAdd={() => (addOpen = true)} />
		</div>

		<div class="bottom-nav">
			<button class="nav-link nav-btn" onclick={() => (notifOpen = true)}>
				🔔 通知
				{#if notifUnseen > 0}<span class="badge">{notifUnseen}</span>{/if}
			</button>
			<a href="/search" class="nav-link">🔍 搜索</a>
			<a href="/chatbox" class="nav-link">💬 Chatbox</a>
			<a href="/moderation" class="nav-link">🚫 屏蔽</a>
			<a href="/settings" class="nav-link">⚙️ 设置</a>
		</div>
	</aside>

	{#if menuOpen || friendsOpen}
		<div class="drawer-backdrop" onclick={closeDrawers} role="presentation"></div>
	{/if}

	<main class="main">
		<FeedFilterBar bind:mode={feedMode} onModeChange={setFeedMode} />
		<div class="feed" class:bubbles={feedMode === 'bubbles'} bind:this={listEl}>
			{#if $filteredFeed.length === 0}
				<div class="placeholder">
					<div class="big-icon">📡</div>
					<h2>还没有动态</h2>
					<p class="muted">
						添加并登录 VRChat 账号后，好友的上线、离线、移动世界、切换模型、状态变化会实时显示在这里。
					</p>
				</div>
			{:else}
				{#each $filteredFeed as entry (entry.id)}
					<FeedItem {entry} mode={feedMode} />
				{/each}
			{/if}
		</div>
	</main>

	<aside class="rightbar" class:open={friendsOpen}>
		<FriendList />
	</aside>
</div>

<AddAccountDialog bind:open={addOpen} onClose={() => (addOpen = false)} />
<TwoFactorDialog
	bind:open={twofaOpen}
	accountId={twofaAccountId}
	methods={twofaMethods}
	onClose={() => (twofaOpen = false)}
/>
<NotificationPanel bind:open={notifOpen} />

<style>
	.app {
		display: grid;
		grid-template-columns: 280px 1fr 320px;
		height: 100vh;
		overflow: hidden;
	}
	.sidebar,
	.rightbar {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.sidebar {
		background: var(--bg-1);
	}
	.account-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.bottom-nav {
		margin-top: auto;
		padding: 10px 12px;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nav-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
		color: var(--text-dim);
		text-decoration: none;
	}
	.nav-link:hover {
		background: var(--bg-3);
		color: var(--text);
		text-decoration: none;
	}
	.nav-btn {
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
		width: 100%;
		font: inherit;
		position: relative;
	}
	.nav-btn .badge {
		margin-left: auto;
		font-size: 10px;
		background: var(--danger);
		color: white;
		padding: 1px 6px;
		border-radius: 8px;
		font-weight: 700;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px 14px 10px;
	}
	.logo {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: linear-gradient(135deg, var(--accent), var(--accent-2));
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 20px;
		color: white;
		box-shadow: 0 4px 12px rgba(124, 92, 255, 0.3);
	}
	.brand-name {
		font-weight: 700;
		font-size: 15px;
	}
	.brand-sub {
		font-size: 11px;
		color: var(--text-faint);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		padding: 6px 14px 12px;
	}
	.stat {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 6px;
		text-align: center;
	}
	.stat .num {
		font-size: 18px;
		font-weight: 700;
	}
	.stat .num.online {
		color: var(--online);
	}
	.stat .lbl {
		font-size: 10px;
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 2px;
	}
	.main {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}
	.feed {
		flex: 1;
		overflow-y: auto;
		background: var(--bg-0);
	}
	.feed.bubbles {
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 10px;
		padding: 12px;
	}
	.feed.bubbles .placeholder {
		height: auto;
		margin: auto;
		align-self: center;
	}
	.placeholder {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px;
		text-align: center;
	}
	.big-icon {
		font-size: 60px;
		opacity: 0.6;
		margin-bottom: 14px;
	}
	.placeholder h2 {
		margin: 0 0 8px;
		font-size: 18px;
	}
	.placeholder p {
		max-width: 380px;
		margin: 0;
		line-height: 1.6;
	}

	.mobile-topbar {
		display: none;
	}

	@media (max-width: 1200px) {
		.app {
			grid-template-columns: 240px 1fr 280px;
		}
	}
	/* 移动端：左右栏折叠为抽屉 */
	@media (max-width: 980px) {
		.app {
			grid-template-columns: 1fr;
		}
		.mobile-topbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			flex: none;
			padding: 8px 10px;
			background: var(--bg-1);
			border-bottom: 1px solid var(--border);
		}
		.mob-btn {
			width: 36px;
			height: 36px;
			border-radius: 8px;
			border: 1px solid var(--border);
			background: var(--bg-2);
			color: var(--text);
			font-size: 16px;
			cursor: pointer;
		}
		.mob-btn:active {
			background: var(--bg-3);
		}
		.mob-title {
			font-weight: 700;
			font-size: 15px;
		}
		.sidebar,
		.rightbar {
			position: fixed;
			top: 0;
			bottom: 0;
			z-index: 80;
			width: min(300px, 86vw);
			box-shadow: 0 0 40px rgba(0, 0, 0, 0.4);
			transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
		}
		.sidebar {
			left: 0;
			transform: translateX(-105%);
		}
		.rightbar {
			right: 0;
			transform: translateX(105%);
		}
		.sidebar.open,
		.rightbar.open {
			transform: translateX(0);
		}
		.drawer-backdrop {
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.5);
			z-index: 70;
		}
		.main {
			min-height: 0;
		}
		.feed.bubbles .entry {
			min-width: 180px;
		}
	}
	@media (max-width: 480px) {
		.feed.bubbles .entry {
			min-width: 100%;
		}
	}
</style>
