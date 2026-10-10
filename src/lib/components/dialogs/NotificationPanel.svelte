<script>
	import Icon from '../ui/Icon.svelte';
	import { notificationsOpen, openUser, openWorld, askConfirm } from '$lib/stores/overlay.js';
	import { notificationsTick, unseenCount, refreshUnseen } from '$lib/stores/notifications.js';
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
		friendRequest: ['user-plus', 'Friend request'],
		invite: ['mail', 'Invite'],
		requestInvite: ['hand', 'Invite request'],
		message: ['message', 'Message'],
		groupAnnouncement: ['megaphone', 'Group announcement'],
		inviteResponse: ['send', 'Invite response'],
		requestInviteResponse: ['send', 'Request response'],
		groupInvite: ['users', 'Group invite'],
		groupJoinRequest: ['users', 'Group join request'],
		boop: ['hand', 'Boop'],
		moderation: ['shield', 'Moderation']
	};

	let items = $state(/** @type {any[]} */ ([]));
	let loading = $state(false);
	let error = $state('');
	let accountId = $state('');

	async function refresh() {
		loading = true;
		try {
			const j = await api('/api/notifications', { query: { limit: 200, accountId } });
			items = j.notifications || [];
			if (!accountId) unseenCount.set(Object.values(j.unseen || {}).reduce((a, b) => a + b, 0));
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

	const drop = (it) => {
		items = items.filter((x) => x.id !== it.id);
		refreshUnseen();
	};

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
		refreshUnseen();
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
		if (await run(() => act(it, { action: 'accept' }), 'Friend request accepted')) drop(it);
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
		if (it && (await run(() => act(it, { action: 'respond', responseSlot: slot }), 'Replied'))) drop(it);
	}

	async function clearAll() {
		if (!(await askConfirm(accountId ? 'Clear all notifications for this account?' : 'Clear all notifications?', { okLabel: 'Clear', danger: true }))) return;
		await run(() => api('/api/notifications', { method: 'POST', body: { action: 'dismiss', accountId: accountId || undefined } }));
		items = [];
		refreshUnseen();
	}

	const close = () => notificationsOpen.set(false);
	const sender = (it) => it.senderDisplayName || it.senderUsername || it.senderUserId?.slice(0, 8) || '?';
</script>

{#if $notificationsOpen}
	<Modal title="Notifications" size="md" onclose={close}>
		<div class="tools">
			<select bind:value={accountId}>
				<option value="">All accounts</option>
				{#each $accounts as a (a.id)}<option value={a.id}>{accountLabel(a)}</option>{/each}
			</select>
			<span class="faint small nowrap">{items.length} total</span>
			<button class="btn ghost sm" onclick={refresh} disabled={loading}><Icon name="refresh" /> Refresh</button>
			<button class="btn danger sm" onclick={clearAll} disabled={!items.length}>Clear</button>
		</div>

		{#if error}
			<Notice kind="error" text={error} onretry={refresh} />
		{:else if loading && !items.length}
			<Notice kind="loading" />
		{:else if !items.length}
			<Notice icon="bell" text="No notifications" />
		{:else}
			<ul>
				{#each items as it (it.id)}
					{@const [icon, label] = KINDS[it.type] || ['bell', it.type]}
					{@const d = it.worldId ? describeLocation(`${it.worldId}:${it.instanceId || ''}`) : null}
					<li class:unseen={!it.seenAt}>
						<div class="head">
							<span><Icon name={icon} /></span>
							<strong>{label}</strong>
							{#if !it.seenAt}<span class="badge accent">New</span>{/if}
							<span class="spacer"></span>
							<span class="faint small">{timeAgo(it.createdAt, $now)}</span>
						</div>
						<div class="from">
							From <strong>{sender(it)}</strong>
							{#if it.accountId}<span class="faint small">via {accountName(it.accountId)}</span>{/if}
						</div>
						{#if d}
							<div class="place">
								<button class="world" onclick={() => openWorld(it.worldId, it.accountId)}><Icon name="globe" /> {it.worldName || 'World'}</button>
								{#if d.kind === 'instance'}
									{#if d.parsed.instanceName}<span class="inst" title={d.tag}>#{d.parsed.instanceName}</span>{/if}
									<AccessBadge place={d} showPublic />
								{/if}
							</div>
						{/if}
						{#if it.message}<div class="msg">{it.message}</div>{/if}
						<div class="acts">
							{#if it.senderUserId && it.accountId}
								<button class="btn ghost xs" onclick={() => openUser(it.senderUserId, { accountId: it.accountId, name: sender(it) })}>View user</button>
							{/if}
							{#if it.type === 'friendRequest' && it.accountId}
								<button class="btn primary xs" onclick={() => accept(it)}><Icon name="check" /> Accept</button>
							{/if}
							{#if it.type === 'requestInvite' && it.accountId && it.senderUserId}
								<button class="btn primary xs" title="Invite them to the instance this account is in" onclick={() => inviteBack(it)}><Icon name="send" /> Invite them</button>
							{/if}
							{#if (it.type === 'invite' || it.type === 'requestInvite') && it.accountId}
								<button class="btn xs" title="Reply with a preset message and decline" onclick={() => reply(it)}><Icon name="mail" /> Reply &amp; decline</button>
							{/if}
							{#if !it.seenAt}<button class="btn ghost xs" onclick={() => seen(it)}>Mark as read</button>{/if}
							<button class="btn ghost danger xs" onclick={() => dismiss(it)}>Dismiss</button>
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
	title="Reply & decline"
	hint="Pick a message to send it and decline this invite."
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
	.inst {
		font-size: 12px;
		font-weight: 650;
		color: var(--text-dim);
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
