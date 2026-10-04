<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { accounts, accountSummary, accountLabel } from '$lib/stores/accounts.js';
	import { accountFilter } from '$lib/stores/feed.js';
	import { addAccountOpen } from '$lib/stores/overlay.js';
	import { describeLocation } from '$lib/shared/location.js';
	import { STATUS_LABEL } from '$lib/shared/presence.js';
	import Avatar from '../ui/Avatar.svelte';
	import Place from '../ui/Place.svelte';
	import AccountControls from './AccountControls.svelte';

	/** Selecting an account filters the feed (and takes you there). */
	function select(id) {
		accountFilter.set($accountFilter === id ? null : id);
		if (page.url.pathname !== '/') goto('/');
	}

	const dotColor = (a) => (a.connected ? 'var(--online)' : a.loggedIn ? 'var(--warn)' : 'var(--offline)');
</script>

<div class="accounts">
	<div class="head">
		<span class="h">账号</span>
		<span class="faint small">{$accountSummary.live}/{$accountSummary.total} 在线</span>
		<span class="spacer"></span>
		<button class="btn ghost icon sm" onclick={() => addAccountOpen.set(true)} title="添加账号">＋</button>
	</div>

	<div class="list">
		<button class="acc all" class:on={!$accountFilter} onclick={() => accountFilter.set(null)}>
			<span class="glyph">◎</span>
			<span class="name">全部账号</span>
		</button>

		{#each $accounts as a (a.id)}
			{@const u = a.currentUser}
			{@const d = describeLocation(u?.location)}
			<div class="acc" class:on={$accountFilter === a.id}>
				<button class="main" onclick={() => select(a.id)} title={a.username}>
					<Avatar src={u?.currentAvatarThumbnailImageUrl} name={accountLabel(a)} size={32} accountId={a.id} dot={dotColor(a)} />
					<span class="text">
						<span class="name ellipsis">{accountLabel(a)}</span>
						<span class="sub ellipsis">
							{#if a.connected}
								{#if d.kind === 'instance' || d.kind === 'private'}
									<Place location={u?.location} accountId={a.id} link={false} />
								{:else if u?.status && u.status !== 'offline'}
									<span class="faint">{STATUS_LABEL[u.status] || u.status} · 未加入世界</span>
								{:else}
									<span class="faint">离线</span>
								{/if}
							{:else if a.loggedIn}
								<span class="warn" title={a.lastError || ''}>已登录 · 连接中…</span>
							{:else if a.lastError}
								<span class="err" title={a.lastError}>登录失败</span>
							{:else}
								<span class="faint">未登录</span>
							{/if}
						</span>
					</span>
				</button>
				<span class="ctrl"><AccountControls account={a} compact /></span>
			</div>
		{/each}

		{#if $accounts.length === 0}
			<div class="none">
				<p class="muted small">还没有账号</p>
				<button class="btn primary sm" onclick={() => addAccountOpen.set(true)}>＋ 添加账号</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.accounts {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}
	.head {
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px 4px 16px;
	}
	.h {
		font-size: 11.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		text-transform: uppercase;
	}
	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 2px 8px 12px;
	}
	.acc {
		position: relative;
		display: flex;
		align-items: center;
		border-radius: var(--r);
	}
	.acc:hover {
		background: var(--bg-2);
	}
	.acc.on {
		background: var(--accent-soft);
	}
	.main,
	.all {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-radius: var(--r);
	}
	.all {
		width: 100%;
	}
	.glyph {
		width: 32px;
		text-align: center;
		color: var(--text-faint);
		font-size: 16px;
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.name {
		font-size: 13px;
		font-weight: 550;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11.5px;
		color: var(--text-dim);
	}
	.warn {
		color: var(--warn);
	}
	.err {
		color: var(--danger);
	}
	.ctrl {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		display: none;
		padding-left: 18px;
		background: linear-gradient(90deg, transparent, var(--bg-2) 18px);
	}
	.acc.on .ctrl {
		background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 12%, var(--bg-1)) 18px);
	}
	.acc:hover .ctrl,
	.acc:focus-within .ctrl {
		display: block;
	}
	.none {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px 0;
	}
</style>
