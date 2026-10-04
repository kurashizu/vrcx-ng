<script>
	import { loggedInAccounts, accountLabel } from '$lib/stores/accounts.js';
	import { openUser, askConfirm } from '$lib/stores/overlay.js';
	import { api, run, accountPath } from '$lib/client/api.js';
	import { act } from '$lib/client/actions.js';
	import { createResource } from '$lib/client/resource.svelte.js';
	import { timeAgo } from '$lib/shared/format.js';
	import { now } from '$lib/stores/clock.js';
	import Page from '$lib/components/ui/Page.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import ListRow from '$lib/components/ui/ListRow.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';

	const KINDS = {
		mute: { label: '静音', icon: '🔇', undo: 'unmute' },
		block: { label: '屏蔽', icon: '⛔', undo: 'unblock' }
	};

	let accountId = $state('');
	let kind = $state('mute');

	// default to the first logged-in account
	$effect(() => {
		if (!$loggedInAccounts.some((a) => a.id === accountId)) accountId = $loggedInAccounts[0]?.id || '';
	});

	const res = createResource((aid, k) => api(`${accountPath(aid)}/moderations`, { query: { type: k } }));
	const reload = () => accountId && res.load(accountId, kind);
	$effect(() => {
		accountId;
		kind;
		reload();
	});

	const entries = $derived(res.data?.entries || []);

	async function undo(e) {
		const k = KINDS[kind];
		if (!(await askConfirm(`解除对 ${e.targetDisplayName || e.targetUserId} 的${k.label}？`, { okLabel: '解除' }))) return;
		if (await run(() => act(accountId, k.undo, e.targetUserId), '已解除')) reload();
	}
</script>

<Page title="屏蔽管理" icon="🚫" subtitle="查看和解除各个账号的静音 / 屏蔽名单">
	{#snippet actions()}
		<select class="acc" bind:value={accountId}>
			{#each $loggedInAccounts as a (a.id)}<option value={a.id}>{accountLabel(a)}</option>{/each}
		</select>
		<button class="btn sm" onclick={reload} disabled={res.loading}>{res.loading ? '加载中…' : '↻ 刷新'}</button>
	{/snippet}

	<Tabs variant="pill" bind:value={kind} tabs={Object.entries(KINDS).map(([id, k]) => ({ id, label: k.label, icon: k.icon }))} />

	{#if !accountId}
		<Notice text="没有已登录的账号" />
	{:else}
		{#if res.data?.source === 'cache'}<div class="badge warn note">VRChat API 暂时不可用，显示的是本地缓存</div>{/if}
		{#if res.error}
			<Notice kind="error" text={res.error} onretry={reload} />
		{:else if res.loading && !res.data}
			<Notice kind="loading" />
		{:else if !entries.length}
			<Notice icon={KINDS[kind].icon} text="没有{KINDS[kind].label}的用户" />
		{:else}
			<div class="list">
				{#each entries as e (e.targetUserId + e.type)}
					<ListRow name={e.targetDisplayName} size={34} onclick={() => openUser(e.targetUserId, { accountId })}>
						{#snippet title()}{e.targetDisplayName || e.targetUserId}{/snippet}
						{#snippet meta()}
							<span class="mono">{e.targetUserId}</span>
							{#if e.created}<span>{timeAgo(e.created, $now)}</span>{/if}
						{/snippet}
						{#snippet trailing()}
							<button class="btn sm" onclick={(ev) => (ev.stopPropagation(), undo(e))}>解除</button>
						{/snippet}
					</ListRow>
				{/each}
			</div>
		{/if}
	{/if}
</Page>

<style>
	.acc {
		width: auto;
		min-width: 160px;
	}
	.note {
		align-self: flex-start;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
