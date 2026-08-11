<script>
	import AccountList from '$lib/components/AccountList.svelte';
	import FeedFilterBar from '$lib/components/FeedFilterBar.svelte';
	import FeedItem from '$lib/components/FeedItem.svelte';
	import FriendList from '$lib/components/FriendList.svelte';
	import AddAccountDialog from '$lib/components/AddAccountDialog.svelte';
	import TwoFactorDialog from '$lib/components/TwoFactorDialog.svelte';
	import { filteredFeed } from '$lib/stores/feed.js';
	import { accounts, loggedInCount, onlineCount } from '$lib/stores/accounts.js';
	import { onMount } from 'svelte';

	let addOpen = $state(false);
	let twofaOpen = $state(false);
	let twofaAccountId = $state('');
	let twofaMethods = $state(/** @type {string[]} */ ([]));
	let listEl;

	function on2faEvent(e) {
		const { accountId, methods } = e.detail;
		twofaAccountId = accountId;
		twofaMethods = methods;
		twofaOpen = true;
	}

	onMount(() => {
		window.addEventListener('vrc-2fa-required', on2faEvent);
		return () => window.removeEventListener('vrc-2fa-required', on2faEvent);
	});
</script>

<svelte:head>
	<title>vrcx-ng · 多账号动态</title>
</svelte:head>

<div class="app">
	<aside class="sidebar">
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
		<AccountList onAdd={() => (addOpen = true)} />

		<div class="bottom-nav">
			<a href="/chatbox" class="nav-link">💬 Chatbox</a>
			<a href="/settings" class="nav-link">⚙️ 设置</a>
		</div>
	</aside>

	<main class="main">
		<FeedFilterBar />
		<div class="feed" bind:this={listEl}>
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
					<FeedItem {entry} />
				{/each}
			{/if}
		</div>
	</main>

	<aside class="rightbar">
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

	@media (max-width: 1200px) {
		.app {
			grid-template-columns: 240px 1fr 280px;
		}
	}
	@media (max-width: 980px) {
		.app {
			grid-template-columns: 220px 1fr;
		}
		.rightbar {
			display: none;
		}
	}
</style>
