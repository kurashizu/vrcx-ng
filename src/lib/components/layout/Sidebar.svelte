<script>
	import { page } from '$app/state';
	import { unseenCount } from '$lib/stores/notifications.js';
	import { notificationsOpen } from '$lib/stores/overlay.js';
	import AccountList from './AccountList.svelte';

	const NAV = [
		{ href: '/', icon: '📡', label: '动态' },
		{ href: '/friends', icon: '▦', label: '好友总览' },
		{ href: '/search', icon: '🔍', label: '搜索' },
		{ href: '/stats', icon: '📊', label: '统计' },
		{ href: '/moderation', icon: '🚫', label: '屏蔽管理' },
		{ href: '/chatbox', icon: '💬', label: 'Chatbox' },
		{ href: '/settings', icon: '⚙️', label: '设置' }
	];

	const active = (href) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<div class="side">
	<a class="brand" href="/">
		<span class="logo">V</span>
		<span>
			<span class="app">vrcx-ng</span>
			<span class="tag">多账号 VRChat 客户端</span>
		</span>
	</a>

	<nav>
		{#each NAV.slice(0, 2) as n (n.href)}
			<a class="item" class:on={active(n.href)} href={n.href}><span class="ico">{n.icon}</span>{n.label}</a>
		{/each}
		<button class="item" onclick={() => notificationsOpen.set(true)}>
			<span class="ico">🔔</span>通知
			{#if $unseenCount > 0}<span class="badge danger">{$unseenCount > 99 ? '99+' : $unseenCount}</span>{/if}
		</button>
		{#each NAV.slice(2) as n (n.href)}
			<a class="item" class:on={active(n.href)} href={n.href}><span class="ico">{n.icon}</span>{n.label}</a>
		{/each}
	</nav>

	<div class="divider"></div>
	<AccountList />
</div>

<style>
	.side {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg-1);
		border-right: 1px solid var(--border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 16px 12px;
		color: var(--text);
		text-decoration: none;
	}
	.logo {
		width: 34px;
		height: 34px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, var(--accent), var(--link));
		color: #fff;
		font-weight: 800;
		font-size: 17px;
	}
	.app {
		display: block;
		font-weight: 700;
		font-size: 15px;
		line-height: 1.2;
	}
	.tag {
		display: block;
		font-size: 11px;
		color: var(--text-faint);
	}
	nav {
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0 8px 8px;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 7px 10px;
		border-radius: var(--r);
		color: var(--text-dim);
		font-size: 13.5px;
		text-decoration: none;
	}
	.item:hover {
		background: var(--bg-2);
		color: var(--text);
		text-decoration: none;
	}
	.item.on {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.ico {
		width: 20px;
		text-align: center;
	}
	.item .badge {
		margin-left: auto;
	}
	.divider {
		margin: 0 16px 8px;
	}
</style>
