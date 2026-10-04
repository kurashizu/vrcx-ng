<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { refreshAccounts } from '$lib/stores/accounts.js';
	import { connectSSE, disconnectSSE } from '$lib/stores/sse.js';
	import { fetchFriendsSnapshot, startFriendsWatchdog } from '$lib/stores/friends.js';
	import { startUnseenCounter } from '$lib/stores/notifications.js';
	import { loadSettings, applyTheme, getSetting } from '$lib/stores/settings.js';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import OverlayHost from '$lib/components/layout/OverlayHost.svelte';
	import FriendRail from '$lib/components/friends/FriendRail.svelte';
	import NotificationPanel from '$lib/components/dialogs/NotificationPanel.svelte';
	import AddAccountDialog from '$lib/components/dialogs/AddAccountDialog.svelte';
	import TwoFactorDialog from '$lib/components/dialogs/TwoFactorDialog.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
	import Toasts from '$lib/components/ui/Toasts.svelte';

	let { children } = $props();

	let navOpen = $state(false);
	let railOpen = $state(false);
	// the friends overview page is the friend list, full size
	const hasRail = $derived(page.url.pathname !== '/friends');

	afterNavigate(() => {
		navOpen = false;
		railOpen = false;
	});

	onMount(() => {
		loadSettings();
		refreshAccounts().catch(console.error);
		connectSSE();
		// HTTP snapshot as a fallback for the SSE `hello` (e.g. right after a restart)
		fetchFriendsSnapshot().catch((err) => console.warn('initial friends fetch failed:', err.message));
		const stopWatchdog = startFriendsWatchdog();
		const stopCounter = startUnseenCounter();

		// coming back to the tab (sleep, background throttling): catch up
		const onVisible = () => document.visibilityState === 'visible' && fetchFriendsSnapshot().catch(() => {});
		document.addEventListener('visibilitychange', onVisible);

		// 'system' theme has to be re-resolved when the OS flips
		const mq = matchMedia('(prefers-color-scheme: dark)');
		const onScheme = () => applyTheme(getSetting('ui.theme'));
		mq.addEventListener('change', onScheme);

		return () => {
			disconnectSSE();
			stopWatchdog();
			stopCounter();
			document.removeEventListener('visibilitychange', onVisible);
			mq.removeEventListener('change', onScheme);
		};
	});
</script>

<div class="shell" class:no-rail={!hasRail}>
	<div class="topbar">
		<button class="btn ghost icon" onclick={() => ((navOpen = !navOpen), (railOpen = false))} aria-label="菜单">☰</button>
		<span class="title">vrcx-ng</span>
		{#if hasRail}
			<button class="btn ghost icon" onclick={() => ((railOpen = !railOpen), (navOpen = false))} aria-label="好友">👥</button>
		{:else}
			<span class="ph"></span>
		{/if}
	</div>

	<aside class="nav" class:open={navOpen}>
		<Sidebar />
	</aside>

	<main class="main">
		{@render children()}
	</main>

	{#if hasRail}
		<aside class="rail" class:open={railOpen}>
			<FriendRail />
		</aside>
	{/if}

	{#if navOpen || railOpen}
		<div class="scrim" role="presentation" onclick={() => ((navOpen = false), (railOpen = false))}></div>
	{/if}
</div>

<OverlayHost />
<NotificationPanel />
<AddAccountDialog />
<TwoFactorDialog />
<ConfirmDialog />
<ContextMenu />
<Toasts />

<style>
	.shell {
		display: grid;
		grid-template-columns: 252px minmax(0, 1fr) 328px;
		height: 100dvh;
		overflow: hidden;
	}
	.shell.no-rail {
		grid-template-columns: 252px minmax(0, 1fr);
	}
	.nav,
	.rail,
	.main {
		min-height: 0;
		min-width: 0;
	}
	.main {
		overflow: hidden;
		background: var(--bg-0);
	}
	.topbar,
	.scrim {
		display: none;
	}

	@media (max-width: 1240px) {
		.shell {
			grid-template-columns: 228px minmax(0, 1fr) 296px;
		}
		.shell.no-rail {
			grid-template-columns: 228px minmax(0, 1fr);
		}
	}

	/* narrow screens: sidebar and friend list become drawers */
	@media (max-width: 980px) {
		.shell,
		.shell.no-rail {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
		}
		.topbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 6px 8px;
			background: var(--bg-1);
			border-bottom: 1px solid var(--border);
		}
		.title {
			font-weight: 700;
		}
		.ph {
			width: 30px;
		}
		.nav,
		.rail {
			position: fixed;
			top: 0;
			bottom: 0;
			z-index: var(--z-rail);
			width: min(320px, 88vw);
			box-shadow: var(--shadow-lg);
			transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
		}
		.nav {
			left: 0;
			transform: translateX(-105%);
		}
		.rail {
			right: 0;
			transform: translateX(105%);
		}
		.nav.open,
		.rail.open {
			transform: none;
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: calc(var(--z-rail) - 1);
			background: rgba(0, 0, 0, 0.5);
		}
	}
</style>
