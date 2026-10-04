<script>
	import { notificationsOpen, openUser, openWorld, askConfirm } from '$lib/stores/overlay.js';
	import { notificationsTick } from '$lib/stores/notifications.js';
	import { accounts, accountName, accountLabel } from '$lib/stores/accounts.js';
	import { now } from '$lib/stores/clock.js';
	import { api, run, accountPath } from '$lib/client/api.js';
	import { inviteUser } from '$lib/client/actions.js';
	import { timeAgo } from '$lib/shared/format.js';
	import { describeLocation } from '$lib/shared/location.js';
	import Modal from '../ui/Modal.svelte';
	import Notice from '../ui/Notice.svelte';
	import AccessBadge from '../ui/AccessBadge.svelte';
	import InviteMessageDialog from './InviteMessageDialog.svelte';

	const KINDS = {
		friendRequest: ['🤝', '好友请求'],
		invite: ['✉️', '实例邀请'],
		requestInvite: ['✋', '请求加入'],
		message: ['💬', '消息'],
		groupAnnouncement: ['📢', '群公告'],
		inviteResponse: ['📨', '邀请回应'],
		requestInviteResponse: ['📨', '请求回应'],
		groupInvite: ['👥', '群邀请'],
		groupJoinRequest: ['👥', '入群申请'],
		boop: ['👋', 'Boop'],
		moderation: ['🛡️', '管理通知']
	};

	let items = $state(/** @type {any[]} */ ([]));
	let loading = $state(false);
	let error = $state('');
	let accountId = $state('');

	async function refresh() {
		loading = true;
		try {
			items = (await api('/api/notifications', { query: { limit: 200, accountId } })).notifications || [];
			error = '';
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	// load on open and on every server-side change; poll slowly while open
	$effect(() => {
		if (!$notificationsOpen) return;
		$notificationsTick;
		accountId;
		refresh();
	});
	$effect(() => {
		if (!$notificationsOpen) return;
		const id = setInterval(refresh, 15000);
		return () => clearInterval(id);
	});

	const drop = (it) => (items = items.filter((x) => x.id !== it.id));

	/** act on a notification through its account (VRChat side + local inbox) */
	const act = (it, body) => api(`${accountPath(it.accountId)}/notification`, { method: 'POST', body: { notificationId: it.id, ...body } });
	/** local-inbox fallback when VRChat can't be reached / the notification has no account */
	const local = (action, id) => api('/api/notifications', { method: 'POST', body: { action, id } });

	async function seen(it) {
		try {
			if (!it.accountId) throw 0;
			await act(it, { action: 'see' });
		} catch {
			await local('seen', it.id).catch(() => {});
		}
		items = items.map((x) => (x.id === it.id ? { ...x, seenAt: Date.now() } : x));
	}

	async function dismiss(it) {
		try {
			if (!it.accountId) throw 0;
			await act(it, { action: 'hide' });
		} catch {
			await local('dismiss', it.id).catch(() => {});
		}
		drop(it);
	}

	async function accept(it) {
		if (await run(() => act(it, { action: 'accept' }), '已接受好友请求')) drop(it);
	}

	// someone asked to join us → invite them to where this account is
	async function inviteBack(it) {
		if (await inviteUser(it.accountId, it.senderUserId)) {
			await act(it, { action: 'hide' }).catch(() => {});
			drop(it);
		}
	}

	let replyTo = $state(/** @type {any} */ (null));
	let replyOpen = $state(false);
	function reply(it) {
		replyTo = it;
		replyOpen = true;
	}
	async function sendReply(slot) {
		const it = replyTo;
		if (it && (await run(() => act(it, { action: 'respond', responseSlot: slot }), '已回复'))) drop(it);
	}

	async function clearAll() {
		if (!(await askConfirm(accountId ? '清空这个账号的所有通知？' : '清空所有通知？', { okLabel: '清空', danger: true }))) return;
		await run(() => api('/api/notifications', { method: 'POST', body: { action: 'dismiss', accountId: accountId || undefined } }));
		items = [];
	}

	const close = () => notificationsOpen.set(false);
	const sender = (it) => it.senderDisplayName || it.senderUsername || it.senderUserId?.slice(0, 8) || '?';
</script>

{#if $notificationsOpen}
	<Modal title="通知" size="md" onclose={close}>
		<div class="tools">
			<select bind:value={accountId}>
				<option value="">所有账号</option>
				{#each $accounts as a (a.id)}<option value={a.id}>{accountLabel(a)}</option>{/each}
			</select>
			<span class="faint small nowrap">{items.length} 条</span>
			<button class="btn ghost sm" onclick={refresh} disabled={loading}>↻ 刷新</button>
			<button class="btn danger sm" onclick={clearAll} disabled={!items.length}>清空</button>
		</div>

		{#if error}
			<Notice kind="error" text={error} onretry={refresh} />
		{:else if loading && !items.length}
			<Notice kind="loading" />
		{:else if !items.length}
			<Notice icon="🔔" text="暂无通知" />
		{:else}
			<ul>
				{#each items as it (it.id)}
					{@const [icon, label] = KINDS[it.type] || ['🔔', it.type]}
					{@const d = it.worldId ? describeLocation(`${it.worldId}:${it.instanceId || ''}`) : null}
					<li class:unseen={!it.seenAt}>
						<div class="head">
							<span>{icon}</span>
							<strong>{label}</strong>
							{#if !it.seenAt}<span class="badge accent">新</span>{/if}
							<span class="spacer"></span>
							<span class="faint small">{timeAgo(it.createdAt, $now)}</span>
						</div>
						<div class="from">
							来自 <strong>{sender(it)}</strong>
							{#if it.accountId}<span class="faint small">via {accountName(it.accountId)}</span>{/if}
						</div>
						{#if d}
							<div class="place">
								<button class="world" onclick={() => openWorld(it.worldId, it.accountId)}>🌍 {it.worldName || '世界'}</button>
								{#if d.kind === 'instance'}<AccessBadge place={d} />{/if}
							</div>
						{/if}
						{#if it.message}<div class="msg">{it.message}</div>{/if}
						<div class="acts">
							{#if it.senderUserId && it.accountId}
								<button class="btn ghost xs" onclick={() => openUser(it.senderUserId, { accountId: it.accountId, name: sender(it) })}>查看用户</button>
							{/if}
							{#if it.type === 'friendRequest' && it.accountId}
								<button class="btn primary xs" onclick={() => accept(it)}>✓ 接受</button>
							{/if}
							{#if it.type === 'requestInvite' && it.accountId && it.senderUserId}
								<button class="btn primary xs" title="邀请 TA 到这个账号当前所在的实例" onclick={() => inviteBack(it)}>📨 邀请 TA</button>
							{/if}
							{#if (it.type === 'invite' || it.type === 'requestInvite') && it.accountId}
								<button class="btn xs" title="用预设消息回复并拒绝" onclick={() => reply(it)}>✉️ 回复并拒绝</button>
							{/if}
							{#if !it.seenAt}<button class="btn ghost xs" onclick={() => seen(it)}>标为已读</button>{/if}
							<button class="btn ghost danger xs" onclick={() => dismiss(it)}>忽略</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Modal>
{/if}

<InviteMessageDialog
	bind:open={replyOpen}
	accountId={replyTo?.accountId || ''}
	type={replyTo?.type === 'requestInvite' ? 'requestResponse' : 'response'}
	title="回复并拒绝"
	hint="点一条消息即发送，同时拒绝这条邀请。"
	onPick={sendReply}
/>

<style>
	.tools {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	.tools select {
		flex: 1;
	}
	.nowrap {
		white-space: nowrap;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	li {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 12px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--r-lg);
	}
	li.unseen {
		border-color: color-mix(in srgb, var(--accent) 50%, transparent);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.head,
	.from,
	.place {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.world {
		color: var(--link);
	}
	.world:hover {
		text-decoration: underline;
	}
	.msg {
		padding: 6px 10px;
		background: var(--bg-1);
		border-radius: var(--r);
		color: var(--text-dim);
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
	}
</style>
