<script>
	import { untrack } from 'svelte';
	import { accountById, accountLabel, loggedInAccounts } from '$lib/stores/accounts.js';
	import { friendIndex } from '$lib/stores/friends.js';
	import { openAvatar, openWorld, closeOverlay, askConfirm } from '$lib/stores/overlay.js';
	import { api, run, accountPath } from '$lib/client/api.js';
	import { act, copyText, requestInvite, inviteUser, muteUser, blockUser, openVrcProfile } from '$lib/client/actions.js';
	import { createResource } from '$lib/client/resource.svelte.js';
	import { timeAgo, formatDate, vrImage } from '$lib/shared/format.js';
	import { platformLabel } from '$lib/shared/presence.js';
	import Modal from '../ui/Modal.svelte';
	import Hero from '../ui/Hero.svelte';
	import Avatar from '../ui/Avatar.svelte';
	import UserName from '../ui/UserName.svelte';
	import StatusPill from '../ui/StatusPill.svelte';
	import Place from '../ui/Place.svelte';
	import Tabs from '../ui/Tabs.svelte';
	import Block from '../ui/Block.svelte';
	import Facts from '../ui/Facts.svelte';
	import Fact from '../ui/Fact.svelte';
	import Notice from '../ui/Notice.svelte';
	import EditProfileDialog from './EditProfileDialog.svelte';
	import InviteMessageDialog from './InviteMessageDialog.svelte';
	import VrcFavoriteDialog from './VrcFavoriteDialog.svelte';

	/** @type {{ request: { userId: string, accountIds: string[], name: string } }} */
	let { request } = $props();

	const userId = untrack(() => request.userId);
	/** the account everything is done as — and whose point of view (friend or not) is shown */
	let accountId = $state(untrack(() => request.accountIds.find((id) => $accountById.get(id)?.loggedIn) || request.accountIds[0] || ''));
	let tab = $state('about');

	const res = createResource((aid, uid, fresh = false) => api(`${accountPath(aid)}/user/${uid}`, { query: { fresh: fresh ? 1 : '' } }));
	const reload = (fresh = false) => res.load(accountId, userId, fresh);

	$effect(() => {
		accountId;
		if (accountId) reload();
	});

	const user = $derived(res.data?.user);
	const account = $derived($accountById.get(accountId));
	const isSelf = $derived(!!user && account?.currentUser?.id === user.id);
	const bio = $derived(res.data?.profile?.bio || user?.bio || '');
	// private avatars carry no picture in the profile; the friend snapshot may still have one
	const pic = $derived(
		user?.currentAvatarThumbnailImageUrl || user?.currentAvatarImageUrl || user?.profilePicOverrideThumbnail || $friendIndex.get(userId)?.currentAvatarThumbnailImageUrl || ''
	);

	// ---- note (VRChat keeps one per user; the game shows it too) ----
	let note = $state('');
	let noteBusy = $state(false);
	$effect(() => {
		note = user?.note || '';
	});
	async function saveNote() {
		noteBusy = true;
		const r = await run(() => api(`${accountPath(accountId)}/note`, { method: 'POST', body: { userId, note } }), '备注已保存');
		noteBusy = false;
		if (r && user) user.note = r.note ?? note;
	}

	// ---- actions ----
	const doAction = (action, message, extra = {}) => run(() => act(accountId, action, userId, extra), message);

	async function unfriend() {
		if (!(await askConfirm(`确定删除好友 ${user.displayName}？`, { okLabel: '删除好友', danger: true }))) return;
		if (await doAction('unfriend', '已删除好友')) reload(true);
	}

	let editOpen = $state(false);
	let favOpen = $state(false);
	let msgOpen = $state(false);
	let msgKind = $state(/** @type {'request'|'message'} */ ('request'));
	function withMessage(kind) {
		msgKind = kind;
		msgOpen = true;
	}
	function sendWithMessage(slot) {
		return msgKind === 'request' ? requestInvite(accountId, userId, { requestSlot: slot }) : inviteUser(accountId, userId, { messageSlot: slot });
	}

	const tabs = $derived([
		{ id: 'about', label: '关于' },
		{ id: 'avatars', label: '模型', count: res.data?.avatars?.length ?? 0 },
		{ id: 'worlds', label: '世界', count: res.data?.worlds?.length ?? 0 },
		{ id: 'badges', label: '徽章', count: res.data?.badges?.length ?? 0 }
	]);
</script>

<Modal size="lg" flush onclose={closeOverlay}>
	{#if res.loading && !res.data}
		<Notice kind="loading" text="加载用户详情…" />
	{:else if res.error}
		<Notice kind="error" text={res.error} onretry={() => reload()} />
	{:else if user}
		<Hero bg={user.bannerUrl} {accountId}>
			<button class="pic" disabled={!user.currentAvatar} title={user.currentAvatar ? '查看当前模型' : ''} onclick={() => openAvatar(user.currentAvatar, accountId)}>
				<Avatar src={pic} name={user.displayName} size={76} {accountId} square />
			</button>
			<div class="who">
				<div class="name"><UserName {user} /></div>
				{#if user.username}<div class="faint">@{user.username}</div>{/if}
				<div class="badges">
					{#if user.developerType && user.developerType !== 'none'}<span class="badge warn">⭐ {user.developerType}</span>{/if}
					{#if user.isFriend}<span class="badge ok">好友</span>{/if}
					<StatusPill status={user.status} all />
					{#if user.pronouns}<span class="badge">{user.pronouns}</span>{/if}
				</div>
			</div>
		</Hero>

		<div class="tabbar"><Tabs {tabs} bind:value={tab} /></div>

		<div class="pane">
			{#if tab === 'about'}
				<Facts>
					<Fact label="状态">
						{#if user.statusDescription}{user.statusDescription}{:else}<span class="faint">无</span>{/if}
					</Fact>
					<Fact label="所在位置">
						{#if user.location && user.location !== 'offline'}
							<Place location={user.location} worldName={res.data.currentWorld?.name} {accountId} showPublic />
							{#if res.data.currentWorld?.occupants != null}<span class="faint small">👥 {res.data.currentWorld.occupants}</span>{/if}
						{:else}
							<span class="faint">离线</span>
						{/if}
					</Fact>
					<Fact label="上次登录">{#if user.last_login}{timeAgo(user.last_login)}{:else}<span class="faint">未知</span>{/if}</Fact>
					<Fact label="最后活动">{#if user.last_activity}{timeAgo(user.last_activity)}{:else}<span class="faint">未知</span>{/if}</Fact>
					<Fact label="注册时间">{#if user.date_joined}{formatDate(user.date_joined)}{:else}<span class="faint">未知</span>{/if}</Fact>
					<Fact label="最后平台">{platformLabel(user.last_platform) || '—'}</Fact>
				</Facts>

				<Block title="Bio">
					{#if bio}<p class="bio">{bio}</p>{:else}<p class="faint">这个用户没有写 Bio</p>{/if}
					{#if res.data.profile?.bioLinks?.length}
						<div class="links">
							{#each res.data.profile.bioLinks as l (l)}
								{#if /^https?:\/\//i.test(l)}<a href={l} target="_blank" rel="noopener noreferrer">{l}</a>{:else}<span>{l}</span>{/if}
							{/each}
						</div>
					{/if}
				</Block>

				{#if !isSelf}
					<Block title="备注" hint="VRChat 备注，游戏里也看得到">
						<textarea bind:value={note} maxlength="256" rows="2" placeholder="给 TA 写点备注…"></textarea>
						<div class="row note-foot">
							<span class="faint small">{note.length}/256</span>
							<span class="spacer"></span>
							<button class="btn xs" disabled={noteBusy || note === (user.note || '')} onclick={saveNote}>{noteBusy ? '保存中…' : '保存备注'}</button>
						</div>
					</Block>
				{/if}

				<Block title="操作">
					{#snippet actions()}
						{#if $loggedInAccounts.length > 1}
							<select class="acc-select" bind:value={accountId} title="用哪个账号操作（也决定了你和 TA 的好友关系）">
								{#each $loggedInAccounts as a (a.id)}<option value={a.id}>以 {accountLabel(a)} 操作</option>{/each}
							</select>
						{/if}
					{/snippet}
					<div class="actions">
						{#if isSelf}
							<button class="btn primary" onclick={() => (editOpen = true)}>✏️ 编辑个人资料</button>
						{:else if user.isFriend}
							<button class="btn primary" onclick={() => requestInvite(accountId, userId)}>✉️ 请求加入 TA</button>
							<button class="btn" onclick={() => withMessage('request')} title="带一条预设消息">✉️ 带消息请求</button>
							<button class="btn" onclick={() => inviteUser(accountId, userId)} title="邀请 TA 到你当前所在的实例">📨 邀请 TA 加入我</button>
							<button class="btn" onclick={() => withMessage('message')} title="带一条预设消息">📨 带消息邀请</button>
							<button class="btn" onclick={() => (favOpen = true)}>⭐ 好友收藏</button>
						{:else}
							<button class="btn primary" onclick={() => doAction('friendRequest', '好友请求已发送')}>🤝 发送好友请求</button>
						{/if}
						{#if !isSelf}
							<button class="btn" onclick={() => muteUser(accountId, userId)}>🔕 静音</button>
							<button class="btn danger" onclick={() => blockUser(accountId, userId, user.displayName)}>🚫 屏蔽</button>
							{#if user.isFriend}<button class="btn danger" onclick={unfriend}>🗑 删除好友</button>{/if}
						{/if}
						<span class="gap"></span>
						<button class="btn ghost" onclick={() => copyText(user.id, '用户 ID')}>📋 ID</button>
						<button class="btn ghost" onclick={() => copyText(user.displayName, '显示名')}>📋 名字</button>
						<button class="btn ghost" onclick={() => openVrcProfile(user.id)}>🌐 网站</button>
					</div>
				</Block>
			{:else if tab === 'avatars'}
				{#if res.data.avatars?.length}
					<div class="thumbs">
						{#each res.data.avatars as a (a.id)}
							<button class="thumb" title={a.name} onclick={() => openAvatar(a.id, accountId)}>
								<Avatar src={a.thumbnailImageUrl} name={a.name} size={120} {accountId} square />
								<span class="tn ellipsis">{a.name}</span>
								{#if a.releaseStatus && a.releaseStatus !== 'public'}<span class="badge tag">{a.releaseStatus}</span>{/if}
							</button>
						{/each}
					</div>
				{:else}
					<Notice text="这个用户没有公开模型" />
				{/if}
			{:else if tab === 'worlds'}
				{#if res.data.worlds?.length}
					<div class="thumbs">
						{#each res.data.worlds as w (w.id)}
							<button class="thumb" title={w.name} onclick={() => openWorld(w.id, accountId)}>
								<Avatar src={w.thumbnailImageUrl} name={w.name} size={120} {accountId} square />
								<span class="tn ellipsis">{w.name}</span>
								{#if w.occupants != null}<span class="badge tag">👥 {w.occupants}</span>{/if}
							</button>
						{/each}
					</div>
				{:else}
					<Notice text="这个用户没有公开世界" />
				{/if}
			{:else if res.data.badges?.length}
				<div class="badges-grid">
					{#each res.data.badges as b (b.badgeId)}
						<div class="badge-card" title={b.badgeDescription || ''}>
							{#if b.badgeImageUrl}<img src={vrImage(b.badgeImageUrl, accountId)} alt={b.badgeName} />{:else}<span class="noimg">🏅</span>{/if}
							<div class="bn">{b.badgeName}</div>
							{#if b.assignedAt}<div class="faint small">{formatDate(b.assignedAt)}</div>{/if}
						</div>
					{/each}
				</div>
			{:else}
				<Notice text="这个用户没有徽章" />
			{/if}
		</div>
	{/if}
</Modal>

<EditProfileDialog bind:open={editOpen} {accountId} {user} onSaved={() => reload(true)} />
<VrcFavoriteDialog bind:open={favOpen} {accountId} kind="friend" objectId={userId} title="VRChat 好友收藏" />
<InviteMessageDialog
	bind:open={msgOpen}
	{accountId}
	type={msgKind}
	title={msgKind === 'request' ? '带消息请求加入' : '带消息邀请'}
	hint={msgKind === 'request' ? '点一条消息即发送，请求加入 TA 的实例。' : '点一条消息即发送，邀请 TA 到你当前所在的实例。'}
	onPick={sendWithMessage}
/>

<style>
	.pic {
		flex: none;
		border-radius: 18px;
	}
	.pic:not(:disabled):hover {
		filter: brightness(1.1);
	}
	.who {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		display: flex;
		font-size: 22px;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
	}
	.tabbar {
		padding: 0 12px;
		border-bottom: 1px solid var(--border);
	}
	.tabbar :global(.tabs) {
		border-bottom: 0;
	}
	.pane {
		padding: 16px 20px 20px;
	}
	.bio {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.links {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 8px;
		font-size: 13px;
	}
	.note-foot {
		margin-top: 6px;
	}
	.acc-select {
		width: auto;
		max-width: 220px;
		padding: 3px 8px;
		font-size: 12px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.gap {
		flex: 1;
	}
	.thumbs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 12px;
	}
	.thumb {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		text-align: left;
	}
	.thumb :global(.avatar) {
		width: 100%;
		height: auto;
		aspect-ratio: 4 / 3;
	}
	.thumb:hover :global(.avatar) {
		outline: 2px solid var(--accent);
	}
	.tn {
		font-size: 12.5px;
	}
	.tag {
		position: absolute;
		top: 6px;
		right: 6px;
	}
	.badges-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 10px;
	}
	.badge-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--r);
		text-align: center;
	}
	.badge-card img {
		width: 56px;
		height: 56px;
		object-fit: contain;
	}
	.noimg {
		font-size: 36px;
	}
	.bn {
		font-size: 12px;
		font-weight: 600;
	}
</style>
