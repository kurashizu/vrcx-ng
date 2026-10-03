<script>
	import '../app.css';
	import Toasts from '$lib/components/Toasts.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import UserDetailDialog from '$lib/components/UserDetailDialog.svelte';
	import WorldDetailDialog from '$lib/components/WorldDetailDialog.svelte';
	import AvatarDetailDialog from '$lib/components/AvatarDetailDialog.svelte';
	import FriendGrid from '$lib/components/FriendGrid.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { refreshAccounts } from '$lib/stores/accounts.js';
	import { connectSSE } from '$lib/stores/sse.js';
	import { fetchFriendsSnapshot, startEmptyFriendsWatchdog } from '$lib/stores/friends.js';
	import { loadSettings, applyTheme, getSetting } from '$lib/stores/settings.js';

	let { children } = $props();

	onMount(() => {
		if (!browser) return;
		refreshAccounts().catch(console.error);
		connectSSE();
		// Initial friend snapshot fetch as a fallback so the sidebar shows
		// data even before the SSE `hello` event arrives (e.g. right after
		// a server restart that killed all open EventSources).
		fetchFriendsSnapshot().catch((err) =>
			console.warn('Initial friends fetch failed:', err.message)
		);
		// If the store stays empty after the initial fetch (e.g. the API
		// returned nothing yet because pipelines were still starting),
		// keep retrying (with backoff) until it has data.
		const stopWatchdog = startEmptyFriendsWatchdog();
		// Re-fetch when the tab regains focus (covers laptop sleep, etc.)
		const onVisibility = () => {
			if (document.visibilityState === 'visible') {
				fetchFriendsSnapshot().catch(() => {});
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		loadSettings();
		// 跟随系统主题变化
		const mq = matchMedia('(prefers-color-scheme: dark)');
		// 重新按「设置里的主题」套用（dataset.theme 只是解析后的 light/dark，
		// 用它判断的话 'system' 模式永远不会重新计算）
		const onSystemTheme = () => applyTheme(getSetting('ui.theme'));
		mq.addEventListener('change', onSystemTheme);
		return () => {
			mq.removeEventListener('change', onSystemTheme);
			stopWatchdog();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

{@render children()}
<Toasts />
<ContextMenu />
<UserDetailDialog />
<WorldDetailDialog />
<AvatarDetailDialog />
<FriendGrid />
