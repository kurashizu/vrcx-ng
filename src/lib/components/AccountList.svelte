<script>
import { vrImage } from '$lib/shared/format.js';
	import {
		accounts,
		logoutAccount,
		removeAccount,
		reconnectAccount,
		loginAccount
	} from '$lib/stores/accounts.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { accountFilter } from '$lib/stores/feed.js';
	import { parseLocation, shortInstanceLabel } from '$lib/shared/location.js';

	// Mirror the friend list: show each account's game status + current
	// location (world + instance chip). 'private' means incognito.
	function accLoc(acc) {
		const loc = (acc.currentUser?.location || '').trim();
		if (!loc || loc === 'offline') return { text: '离线', cls: 'off', loc: '' };
		if (loc === 'private') return { text: '隐身中', cls: 'invis', loc: '' };
		const p = parseLocation(loc);
		if (!p?.worldId) return { text: loc, cls: '', loc };
		const short = (p.worldId.match(/wrld_[0-9a-f]{4}$/i) || [p.worldId])[0];
		return {
			text: `🌍 ${short}`,
			cls: '',
			loc: `${p.worldId}:${p.instanceId || ''}`,
			chip: shortInstanceLabel(p) || ''
		};
	}
	function statusPill(acc) {
		const st = acc.currentUser?.status || '';
		if (!st || st === 'offline' || st === 'active') return '';
		const map = { 'join me': '🔵 加入我', 'ask me': '🟡 询问我', busy: '🔴 忙碌' };
		return map[st] || st;
	}

	/** @type {{ onAdd: () => void }} */
	let { onAdd } = $props();

	async function login(acc) {
		const r = await loginAccount(acc.id);
		if (r.requires2fa) {
			window.dispatchEvent(
				new CustomEvent('vrc-2fa-required', { detail: { accountId: acc.id, methods: r.requires2fa } })
			);
		}
	}

	async function confirmDelete(acc) {
		if (!confirm(`删除账号 "${acc.displayName}"?`)) return;
		await removeAccount(acc.id);
	}
</script>

<div class="account-list">
	<header>
		<div class="title">
			<span class="dot" class:on={$accounts.some((a) => a.connected)}></span>
			<span>账号 ({$accounts.length})</span>
		</div>
		<button class="ghost small" onclick={onAdd} title="添加账号">+</button>
	</header>

	<div class="list">
		<button
			class="account all"
			class:active={$accountFilter === null}
			onclick={() => accountFilter.set(null)}
		>
			<span class="all-dot"></span>
			<span class="name">全部账号</span>
		</button>

		{#each $accounts as acc (acc.id)}
			<div class="account" class:active={$accountFilter === acc.id}>
				<button class="account-main" onclick={() => accountFilter.set(acc.id)} title={acc.username}>
					<div class="avatar">
						{#if acc.currentUser?.currentAvatarThumbnailImageUrl}
							<img src={vrImage(acc.currentUser.currentAvatarThumbnailImageUrl, acc.id)} alt="" loading="lazy" />
						{:else}
							<span>{(acc.displayName || acc.username || '?').slice(0, 1).toUpperCase()}</span>
						{/if}
						<span
							class="state"
							class:online={acc.connected}
							class:warn={acc.loggedIn && !acc.connected}
							class:offline={!acc.loggedIn}
						></span>
					</div>
					<div class="info">
						<div class="name">{acc.displayName || acc.username}</div>
						<div class="status">
							{#if acc.connected}
								<span class="badge online">Live</span>
							{:else if acc.loggedIn}
								<span class="badge warn" title={acc.lastError || ''}>已登录 · 连接中</span>
							{:else if acc.lastError}
								<span class="badge danger" title={acc.lastError}>错误</span>
							{:else}
								<span class="badge offline">未登录</span>
							{/if}
						</div>
						{#if acc.connected}
							{@const L = accLoc(acc)}
							{@const SP = statusPill(acc)}
							<div class="where" title={L.loc || acc.currentUser?.location || ''}>
								{#if SP}
									<span class="st-pill">{SP}</span>
								{/if}
								<span class="loc-txt {L.cls}">{L.text}</span>
								{#if L.chip}
									<span class="inst-chip">{L.chip}</span>
								{/if}
							</div>
						{/if}
					</div>
				</button>
				<div class="actions">
					{#if acc.loggedIn}
						{#if acc.currentUser?.id}
							<button
								class="ghost xs"
								title="查看用户详细信息"
								onclick={() => openUserDetail(acc.id, acc.currentUser.id, acc.displayName || acc.currentUser.displayName)}
							>👤</button>
						{/if}
						{#if !acc.connected}
							<button class="ghost xs" title="重连" onclick={() => reconnectAccount(acc.id)}>↻</button>
						{/if}
						<button class="ghost xs" title="登出" onclick={() => logoutAccount(acc.id)}>⎋</button>
					{:else}
						<button class="ghost xs" title="登录" onclick={() => login(acc)}>↦</button>
						<button class="ghost xs danger" title="删除" onclick={() => confirmDelete(acc)}>✕</button>
					{/if}
				</div>
			</div>
		{/each}

		{#if $accounts.length === 0}
			<div class="empty">
				<p>还没有账号</p>
				<button class="primary small" onclick={onAdd}>+ 添加账号</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.account-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg-1);
		border-right: 1px solid var(--border);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 14px 8px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--offline);
	}
	.dot.on {
		background: var(--online);
		box-shadow: 0 0 6px var(--online);
	}
	.list {
		flex: 1;
		overflow-y: auto;
		padding: 6px;
	}
	.account {
		display: flex;
		align-items: stretch;
		gap: 4px;
		padding: 4px;
		border-radius: 8px;
		margin-bottom: 2px;
	}
	.account:hover {
		background: var(--bg-2);
	}
	.account.active {
		background: var(--bg-3);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.account.all {
		padding: 8px 10px;
		display: flex;
		gap: 8px;
		align-items: center;
		background: transparent;
		border: none;
		width: 100%;
		text-align: left;
		font-size: 13px;
		color: var(--text);
	}
	.account.all:hover {
		background: var(--bg-2);
	}
	.account.all.active {
		background: var(--bg-3);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.account.all .all-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--accent), var(--accent-2));
	}
	.account.all .name {
		font-weight: 500;
	}
	.account-main {
		flex: 1;
		display: flex;
		gap: 10px;
		align-items: center;
		background: transparent;
		border: none;
		padding: 6px;
		border-radius: 6px;
		text-align: left;
		min-width: 0;
	}
	.avatar {
		position: relative;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		color: var(--text);
		flex-shrink: 0;
		overflow: hidden;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.state {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--offline);
		border: 2px solid var(--bg-1);
	}
	.state.online {
		background: var(--online);
	}
	.state.warn {
		background: var(--warn);
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.name {
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.status {
		margin-top: 2px;
	}
	.where {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 2px;
		min-width: 0;
		flex-wrap: wrap;
	}
	.st-pill {
		font-size: 10px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		color: var(--text-dim);
		white-space: nowrap;
	}
	.loc-txt {
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.loc-txt.off {
		color: var(--text-faint);
	}
	.loc-txt.invis {
		color: var(--text-dim);
	}
	.inst-chip {
		font-size: 9px;
		padding: 1px 5px;
		border-radius: 5px;
		background: rgba(124, 92, 255, 0.15);
		color: var(--accent);
		white-space: nowrap;
	}
		.actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		opacity: 0;
		transition: opacity 0.1s;
	}
	.account:hover .actions,
	.account.active .actions {
		opacity: 1;
	}
	button.small {
		padding: 4px 10px;
		font-size: 12px;
	}
	button.xs {
		padding: 2px 7px;
		font-size: 12px;
		min-width: 26px;
	}
	button.danger {
		color: var(--danger);
	}
	.empty {
		text-align: center;
		padding: 24px 12px;
		color: var(--text-dim);
	}
	.empty p {
		margin: 0 0 12px;
	}
</style>
