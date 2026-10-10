<script>
	import Icon from '../ui/Icon.svelte';
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
		const r = await run(() => api(`${accountPath(accountId)}/note`, { method: 'POST', body: { userId, note } }), 'Note saved');
		noteBusy = false;
		if (r && user) user.note = r.note ?? note;
	}

	// ---- actions ----
	const doAction = (action, message, extra = {}) => run(() => act(accountId, action, userId, extra), message);

	async function unfriend() {
		if (!(await askConfirm(`Remove ${user.displayName} from your friends?`, { okLabel: 'Unfriend', danger: true }))) return;
		if (await doAction('unfriend', 'Friend removed')) reload(true);
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
		{ id: 'about', label: 'About' },
		{ id: 'avatars', label: 'Avatars', count: res.data?.avatars?.length || null },
		{ id: 'worlds', label: 'Worlds', count: res.data?.worlds?.length || null },
		{ id: 'badges', label: 'Badges', count: res.data?.badges?.length || null }
	]);
</script>

<Modal size="lg" flush onclose={closeOverlay}>
	{#if res.loading && !res.data}
		<Notice kind="loading" text="Loading user…" />
	{:else if res.error}
		<Notice kind="error" text={res.error} onretry={() => reload()} />
	{:else if user}
		<Hero bg={user.bannerUrl} {accountId}>
			<button class="pic" disabled={!user.currentAvatar} title={user.currentAvatar ? 'View current avatar' : ''} onclick={() => openAvatar(user.currentAvatar, accountId)}>
				<Avatar src={pic} name={user.displayName} size={76} {accountId} square />
			</button>
			<div class="who">
				<div class="name"><UserName {user} /></div>
				{#if user.username}<div class="faint">@{user.username}</div>{/if}
				<div class="badges">
					{#if user.developerType && user.developerType !== 'none'}<span class="badge warn"><Icon name="star" /> {user.developerType}</span>{/if}
					{#if user.isFriend}<span class="badge ok">Friend</span>{/if}
					<StatusPill status={user.status} all />
					{#if user.pronouns}<span class="badge">{user.pronouns}</span>{/if}
				</div>
			</div>
		</Hero>

		<div class="tabbar"><Tabs {tabs} bind:value={tab} /></div>

		<div class="pane">
			{#if tab === 'about'}
				<Facts>
					<Fact label="Status">
						{#if user.statusDescription}{user.statusDescription}{:else}<span class="faint">None</span>{/if}
					</Fact>
					<Fact label="Location">
						{#if user.location && user.location !== 'offline'}
							<Place location={user.location} worldName={res.data.currentWorld?.name} {accountId} showPublic />
							{#if res.data.currentWorld?.occupants != null}<span class="faint small"><Icon name="users" /> {res.data.currentWorld.occupants}</span>{/if}
						{:else}
							<span class="faint">Offline</span>
						{/if}
					</Fact>
					<Fact label="Last login">{#if user.last_login}{timeAgo(user.last_login)}{:else}<span class="faint">Unknown</span>{/if}</Fact>
					<Fact label="Last activity">{#if user.last_activity}{timeAgo(user.last_activity)}{:else}<span class="faint">Unknown</span>{/if}</Fact>
					<Fact label="Joined">{#if user.date_joined}{formatDate(user.date_joined)}{:else}<span class="faint">Unknown</span>{/if}</Fact>
					<Fact label="Last platform">{platformLabel(user.last_platform) || '—'}</Fact>
				</Facts>

				<Block title="Bio">
					{#if bio}<p class="bio">{bio}</p>{:else}<p class="faint">This user has no bio</p>{/if}
					{#if res.data.profile?.bioLinks?.length}
						<div class="links">
							{#each res.data.profile.bioLinks as l (l)}
								{#if /^https?:\/\//i.test(l)}<a href={l} target="_blank" rel="noopener noreferrer">{l}</a>{:else}<span>{l}</span>{/if}
							{/each}
						</div>
					{/if}
				</Block>

				{#if !isSelf}
					<Block title="Note" hint="A VRChat note; also visible in game">
						<textarea bind:value={note} maxlength="256" rows="2" placeholder="Write a note about them…"></textarea>
						<div class="row note-foot">
							<span class="faint small">{note.length}/256</span>
							<span class="spacer"></span>
							<button class="btn xs" disabled={noteBusy || note === (user.note || '')} onclick={saveNote}>{noteBusy ? 'Saving…' : 'Save note'}</button>
						</div>
					</Block>
				{/if}

				<Block title="Actions">
					{#snippet actions()}
						{#if $loggedInAccounts.length > 1}
							<select class="acc-select" bind:value={accountId} title="Account used for actions (also decides the friendship shown)">
								{#each $loggedInAccounts as a (a.id)}<option value={a.id}>As {accountLabel(a)}</option>{/each}
							</select>
						{/if}
					{/snippet}
					<div class="actions">
						{#if isSelf}
							<button class="btn primary" onclick={() => (editOpen = true)}><Icon name="pencil" /> Edit profile</button>
						{:else if user.isFriend}
							<button class="btn primary" onclick={() => requestInvite(accountId, userId)} title="Ask them to invite you to their instance"><Icon name="hand" /> Ask them to invite me</button>
							<button class="btn" onclick={() => withMessage('request')} title="Ask for an invite with a preset message"><Icon name="message" /> Ask with message</button>
							<button class="btn" onclick={() => inviteUser(accountId, userId)} title="Invite them to the instance you are in"><Icon name="send" /> Invite them to my instance</button>
							<button class="btn" onclick={() => withMessage('message')} title="Invite them with a preset message"><Icon name="message" /> Invite with message</button>
							<button class="btn" onclick={() => (favOpen = true)}><Icon name="star" /> Favorite</button>
						{:else}
							<button class="btn primary" onclick={() => doAction('friendRequest', 'Friend request sent')}><Icon name="user-plus" /> Send friend request</button>
						{/if}
						<span class="gap"></span>
						<button class="btn ghost" onclick={() => copyText(user.id, 'user ID')}><Icon name="copy" /> ID</button>
						<button class="btn ghost" onclick={() => copyText(user.displayName, 'display name')}><Icon name="copy" /> Name</button>
						<button class="btn ghost" onclick={() => openVrcProfile(user.id)}><Icon name="globe" /> Website</button>
					</div>
					{#if !isSelf}
						<div class="actions danger-row">
							<span class="faint small">Moderation</span>
							<span class="gap"></span>
							<button class="btn" onclick={() => muteUser(accountId, userId)}><Icon name="bell-off" /> Mute</button>
							<button class="btn danger" onclick={() => blockUser(accountId, userId, user.displayName)}><Icon name="ban" /> Block</button>
							{#if user.isFriend}<button class="btn danger" onclick={unfriend}><Icon name="trash" /> Unfriend</button>{/if}
						</div>
					{/if}
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
					<Notice text="This user has no public avatars" />
				{/if}
			{:else if tab === 'worlds'}
				{#if res.data.worlds?.length}
					<div class="thumbs">
						{#each res.data.worlds as w (w.id)}
							<button class="thumb" title={w.name} onclick={() => openWorld(w.id, accountId)}>
								<Avatar src={w.thumbnailImageUrl} name={w.name} size={120} {accountId} square />
								<span class="tn ellipsis">{w.name}</span>
								{#if w.occupants != null}<span class="badge tag"><Icon name="users" /> {w.occupants}</span>{/if}
							</button>
						{/each}
					</div>
				{:else}
					<Notice text="This user has no public worlds" />
				{/if}
			{:else if res.data.badges?.length}
				<div class="badges-grid">
					{#each res.data.badges as b (b.badgeId)}
						<div class="badge-card" title={b.badgeDescription || ''}>
							{#if b.badgeImageUrl}<img src={vrImage(b.badgeImageUrl, accountId)} alt={b.badgeName} />{:else}<span class="noimg"><Icon name="award" /></span>{/if}
							<div class="bn">{b.badgeName}</div>
							{#if b.assignedAt}<div class="faint small">{formatDate(b.assignedAt)}</div>{/if}
						</div>
					{/each}
				</div>
			{:else}
				<Notice text="This user has no badges" />
			{/if}
		</div>
	{/if}
</Modal>

<EditProfileDialog bind:open={editOpen} {accountId} {user} onSaved={() => reload(true)} />
<VrcFavoriteDialog bind:open={favOpen} {accountId} kind="friend" objectId={userId} title="VRChat friend favorites" />
<InviteMessageDialog
	bind:open={msgOpen}
	{accountId}
	type={msgKind}
	title={msgKind === 'request' ? 'Request invite with message' : 'Invite with message'}
	hint={msgKind === 'request' ? 'Pick a message to send it and request an invite to their instance.' : 'Pick a message to send it and invite them to your current instance.'}
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
	.danger-row {
		align-items: center;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px dashed var(--border);
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
