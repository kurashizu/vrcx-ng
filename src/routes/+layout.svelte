<script>
	import '../app.css';
	import Toasts from '$lib/components/Toasts.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import UserDetailDialog from '$lib/components/UserDetailDialog.svelte';
	import WorldDetailDialog from '$lib/components/WorldDetailDialog.svelte';
	import NotificationPanel from '$lib/components/NotificationPanel.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { refreshAccounts } from '$lib/stores/accounts.js';
	import { connectSSE } from '$lib/stores/sse.js';
	import { loadSettings, applyTheme } from '$lib/stores/settings.js';

	let { children } = $props();

	onMount(() => {
		if (!browser) return;
		refreshAccounts().catch(console.error);
		connectSSE();
		loadSettings();
		// 跟随系统主题变化
		const mq = matchMedia('(prefers-color-scheme: dark)');
		mq.addEventListener('change', () => {
			// 重新触发 applyTheme，让 'system' 模式能即时切换
			const cur = document.documentElement.dataset.theme;
			applyTheme(cur === 'light' || cur === 'dark' ? cur : 'system');
		});
	});
</script>

{@render children()}
<Toasts />
<ContextMenu />
<UserDetailDialog />
<WorldDetailDialog />
<NotificationPanel />
