<script>
	import {
		userDetailRequest,
		userDetailData,
		userDetailLoading,
		userDetailError,
		closeUserDetail,
		setActiveAccount
	} from '$lib/stores/userDetail.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { toasts } from '$lib/stores/toast.js';
	import { onMount, onDestroy } from 'svelte';
	import { timeAgo } from '$lib/shared/format.js';
	import { openAvatarDetail } from '$lib/stores/avatarDetail.js';
	import { openWorldDetail } from '$lib/stores/worldDetail.js';
	import { parseLocation, accessTypeLabel, shortInstanceLabel } from '$lib/shared/location.js';

	let data = $state(null);
	let loading = $state(false);
	let error = $state('');
	let tab = $state('about'); // 'about' | 'avatars' | 'worlds' | 'badges'
	let inflight = null;

	$effect(() => {
		const req = $userDetailRequest;
		if (!req?.userId) {
			data = null;
			error = '';
			return;
		}
		loadUser(req.accountId, req.userId);
	});

	async function loadUser(accountId, userId) {
		// cancel previous (best-effort)
		inflight = userId + ':' + accountId;
		loading = true;
		error = '';
		try {
			const r = await fetch(`/api/accounts/${accountId}/user/${userId}`);
			const j = await r.json();
			if (inflight !== userId + ':' + accountId) return; // stale
			if (!r.ok) {
				error = j.error || `HTTP ${r.status}`;
				data = null;
			} else {
				data = j;
				tab = 'about';
			}
		} catch (err) {
			error = err.message;
		} finally {
			if (inflight === userId + ':' + accountId) loading = false;
		}
	}

	function switchAccount(id) {
		setActiveAccount(id);
	}

	function action(accountId, act, userId, extra = {}) {
		return async () => {
			const r = await fetch(`/api/accounts/${accountId}/actions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: act, userId, ...extra })
			});
			const j = await r.json();
			if (!r.ok || !j.ok) {
				toasts.error(j.error || '操作失败');
			} else {
				toasts.success('操作成功');
			}
		};
	}

	function copyId() {
		if (!data?.user?.id) return;
		navigator.clipboard.writeText(data.user.id).then(
			() => toasts.success('已复制用户 ID'),
			() => toasts.error('复制失败')
		);
	}
	function copyName() {
		if (!data?.user?.displayName) return;
		navigator.clipboard.writeText(data.user.displayName).then(
			() => toasts.success('已复制显示名'),
			() => toasts.error('复制失败')
		);
	}
	function openProfile() {
		if (!data?.user?.id) return;
		window.open(`https://vrchat.com/home/user/${data.user.id}`, '_blank');
	}

	const account = $derived(
		$userDetailRequest?.accountId
			? $accounts.find((a) => a.id === $userDetailRequest.accountId)
			: null
	);

	const instanceLabel = $derived.by(() => {
		const loc = data?.user?.location;
		if (!loc) return '';
		if (loc === 'offline') return '离线';
		if (loc === 'private') return 'Private World';
		const parsed = parseLocation(loc);
		if (!parsed?.worldId) return loc;
		const short = shortInstanceLabel(parsed);
		const type = accessTypeLabel(parsed) ? ` · ${accessTypeLabel(parsed)}` : '';
		return (short || parsed.worldId) + type;
	});

	const currentLocationWorldId = $derived.by(() => {
		const loc = data?.user?.location;
		if (!loc || loc === 'offline' || loc === 'private') return '';
		const wid = String(loc).split(':')[0];
		return wid?.startsWith('wrld_') ? wid : '';
	});

	function openCurrentInstance() {
		const wid = currentLocationWorldId;
		if (!wid) return;
		closeUserDetail();
		openWorldDetail(wid, $userDetailRequest.accountId || undefined);
	}
</script>

{#if $userDetailRequest?.userId}
	<div
		class="modal-backdrop"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeUserDetail();
		}}
		role="presentation"
	>
		<div class="dialog" role="dialog" aria-modal="true">
			<button class="close" onclick={closeUserDetail} aria-label="关闭">×</button>

			{#if loading && !data}
				<div class="loading">
					<div class="spinner"></div>
					加载用户详情…
				</div>
			{:else if error}
				<div class="error">
					{error}
					<button class="ghost small" onclick={() => loadUser($userDetailRequest.accountId, $userDetailRequest.userId)}>重试</button>
				</div>
			{:else if data}
				<header class="hero" style:background-image={data.user?.bannerUrl ? `url(${data.user.bannerUrl})` : ''}>
					<div class="hero-bg"></div>
					<div class="hero-content">
						<div class="avatar">
							{#if data.user?.currentAvatarThumbnailImageUrl}
								<img src={data.user.currentAvatarThumbnailImageUrl} alt="" />
							{:else if data.user?.profilePicOverrideThumbnail}
								<img src={data.user.profilePicOverrideThumbnail} alt="" />
							{:else}
								<span>{(data.user?.displayName || '?').slice(0, 1).toUpperCase()}</span>
							{/if}
						</div>
						<div class="hero-info">
							<div class="display-name">{data.user?.displayName}</div>
							<div class="username">@{data.user?.username}</div>
							<div class="badges">
								{#if data.user?.developerType && data.user.developerType !== 'none'}
									<span class="badge dev" title="VRChat {data.user.developerType}">⭐ {data.user.developerType}</span>
								{/if}
								{#if data.user?.isFriend}
									<span class="badge friend">🤝 好友</span>
								{/if}
								{#if data.user?.status && data.user.status !== 'offline'}
									<span class="badge status" data-s={data.user.status}>{data.user.status}</span>
								{/if}
								{#if data.user?.pronouns}
									<span class="badge pron">({data.user.pronouns})</span>
								{/if}
							</div>
						</div>
						<div class="via">
							via {account?.displayName}
						</div>
					</div>
				</header>

				<nav class="tabs">
					<button class:active={tab === 'about'} onclick={() => (tab = 'about')}>关于</button>
					<button class:active={tab === 'avatars'} onclick={() => (tab = 'avatars')}>
						模型 <span class="count">{data.avatars?.length || 0}</span>
					</button>
					<button class:active={tab === 'worlds'} onclick={() => (tab = 'worlds')}>
						世界 <span class="count">{data.worlds?.length || 0}</span>
					</button>
					<button class:active={tab === 'badges'} onclick={() => (tab = 'badges')}>
						徽章 <span class="count">{data.badges?.length || 0}</span>
					</button>
				</nav>

				<div class="body">
					{#if tab === 'about'}
						<div class="grid">
							<div class="cell">
								<div class="cell-lbl">状态</div>
								<div class="cell-val">
									{#if data.user?.statusDescription}
										{data.user.statusDescription}
									{:else}
										<span class="muted">无</span>
									{/if}
								</div>
							</div>
							<div class="cell">
								<div class="cell-lbl">所在位置</div>
								<div class="cell-val">
									{#if data.currentWorld}
										<button class="loc-btn" onclick={openCurrentInstance} title="打开实例详情">
											<strong>{data.currentWorld.name}</strong>
											<div class="muted small">{instanceLabel} ↗</div>
											{#if data.currentWorld.occupants != null}
												<div class="muted small">👥 {data.currentWorld.occupants} 人</div>
											{/if}
										</button>
									{:else if currentLocationWorldId}
										<button class="loc-btn" onclick={openCurrentInstance} title="打开实例详情">
											<strong>{instanceLabel || '未知世界'}</strong>
											<span class="muted small">点击查看实例详情 ↗</span>
										</button>
									{:else if data.user?.location === 'private'}
										Private World
									{:else if data.user?.location === 'offline'}
										离线
									{:else}
										<span class="muted">未知</span>
									{/if}
								</div>
							</div>
							<div class="cell">
								<div class="cell-lbl">上次登录</div>
								<div class="cell-val">
									{#if data.user?.last_login}
										{timeAgo(data.user.last_login)}
									{:else}
										<span class="muted">未知</span>
									{/if}
								</div>
							</div>
							<div class="cell">
								<div class="cell-lbl">最后活动</div>
								<div class="cell-val">
									{#if data.user?.last_activity}
										{timeAgo(data.user.last_activity)}
									{:else}
										<span class="muted">未知</span>
									{/if}
								</div>
							</div>
							<div class="cell">
								<div class="cell-lbl">注册时间</div>
								<div class="cell-val">
									{#if data.user?.date_joined}
										{new Date(data.user.date_joined).toLocaleDateString()}
									{:else}
										<span class="muted">未知</span>
									{/if}
								</div>
							</div>
							<div class="cell">
								<div class="cell-lbl">最后平台</div>
								<div class="cell-val">{data.user?.last_platform || '—'}</div>
							</div>
						</div>

						<section class="block">
							<h3>Bio</h3>
							<div class="bio">
								{#if data.profile?.bio || data.user?.bio}
									{data.profile?.bio || data.user?.bio}
								{:else}
									<span class="muted">这个用户没有写 bio</span>
								{/if}
							</div>
							{#if data.profile?.bioLinks?.length}
								<div class="bio-links">
									{#each data.profile.bioLinks as l}
										<a href={l} target="_blank" rel="noopener">{l}</a>
									{/each}
								</div>
							{/if}
						</section>

						<section class="block">
							<h3>操作</h3>
							<div class="actions">
								{#if data.user?.isFriend}
									{#if data.user?.location && data.user.location !== 'offline' && data.user.location !== 'private'}
										<button class="primary" onclick={action($userDetailRequest.accountId, 'requestInvite', data.user.id)}>
											✉️ 请求加入 TA 的实例
										</button>
									{/if}
									<button class="ghost" onclick={action($userDetailRequest.accountId, 'mute', data.user.id)}>🔕 静音</button>
									<button class="ghost danger" onclick={action($userDetailRequest.accountId, 'block', data.user.id)}>🚫 屏蔽</button>
								{:else}
									<button class="primary" onclick={action($userDetailRequest.accountId, 'friendRequest', data.user.id)}>🤝 发送好友请求</button>
								{/if}
								<button class="ghost" onclick={copyId}>📋 复制 ID</button>
								<button class="ghost" onclick={copyName}>📋 复制显示名</button>
								<button class="ghost" onclick={openProfile}>🌐 打开主页</button>
							</div>
						</section>
					{:else if tab === 'avatars'}
						<div class="thumbs">
							{#each data.avatars || [] as a (a.id)}
								<button class="thumb btn" onclick={() => openAvatarDetail(a.id, $userDetailRequest.accountId)} title={a.name}>
									{#if a.thumbnailImageUrl}
										<img src={a.thumbnailImageUrl} alt={a.name} loading="lazy" />
									{:else}
										<div class="noimg">?</div>
									{/if}
									<div class="tname" title={a.name}>{a.name}</div>
									{#if a.releaseStatus && a.releaseStatus !== 'public'}
										<span class="tbadge">{a.releaseStatus}</span>
									{/if}
								</button>
							{/each}
							{#if !data.avatars?.length}
								<div class="empty">这个用户没有公开模型</div>
							{/if}
						</div>
					{:else if tab === 'worlds'}
						<div class="thumbs">
							{#each data.worlds || [] as w (w.id)}
								<div class="thumb">
									{#if w.thumbnailImageUrl}
										<img src={w.thumbnailImageUrl} alt={w.name} loading="lazy" />
									{:else}
										<div class="noimg">?</div>
									{/if}
									<div class="tname" title={w.name}>{w.name}</div>
									{#if w.occupants != null}
										<span class="tbadge">👥 {w.occupants}</span>
									{/if}
								</div>
							{/each}
							{#if !data.worlds?.length}
								<div class="empty">这个用户没有公开世界</div>
							{/if}
						</div>
					{:else if tab === 'badges'}
						<div class="badges-grid">
							{#each data.badges || [] as b (b.badgeId)}
								<div class="badge-card" title={b.badgeDescription || ''}>
									{#if b.badgeImageUrl}
										<img src={b.badgeImageUrl} alt={b.badgeName} />
									{:else}
										<div class="noimg">🏅</div>
									{/if}
									<div class="bname">{b.badgeName}</div>
									{#if b.assignedAt}
										<div class="bdate">{new Date(b.assignedAt).toLocaleDateString()}</div>
									{/if}
								</div>
							{/each}
							{#if !data.badges?.length}
								<div class="empty">这个用户没有徽章</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.dialog {
		background: var(--bg-1);
		border: 1px solid var(--border-strong);
		border-radius: 16px;
		width: 100%;
		max-width: 720px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		position: relative;
	}
	.close {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 5;
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 20px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: white;
	}
	.close:hover {
		background: rgba(0, 0, 0, 0.6);
	}
	.loading,
	.error {
		padding: 60px 20px;
		text-align: center;
		color: var(--text-dim);
	}
	.error {
		color: var(--danger);
	}
	.spinner {
		width: 24px;
		height: 24px;
		margin: 0 auto 12px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.hero {
		position: relative;
		padding: 22px 24px;
		background-size: cover;
		background-position: center;
		color: white;
		flex-shrink: 0;
	}
	.hero-bg {
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, rgba(40, 30, 80, 0.9), rgba(20, 30, 60, 0.95));
	}
	.hero-content {
		position: relative;
		display: flex;
		gap: 16px;
		align-items: center;
	}
	.avatar {
		width: 84px;
		height: 84px;
		border-radius: 50%;
		background: var(--bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32px;
		font-weight: 700;
		flex-shrink: 0;
		overflow: hidden;
		border: 3px solid rgba(255, 255, 255, 0.2);
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.hero-info {
		flex: 1;
		min-width: 0;
	}
	.display-name {
		font-size: 22px;
		font-weight: 700;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	}
	.username {
		font-size: 13px;
		opacity: 0.8;
		margin-top: 2px;
	}
	.badges {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: 8px;
	}
	.badges .badge {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.15);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	.badges .badge.status[data-s='active'] {
		background: rgba(31, 184, 255, 0.4);
	}
	.badges .badge.status[data-s='join me'] {
		background: rgba(61, 220, 151, 0.4);
	}
	.badges .badge.status[data-s='busy'] {
		background: rgba(255, 93, 108, 0.4);
	}
	.badges .badge.status[data-s='ask me'] {
		background: rgba(255, 180, 84, 0.4);
	}
	.via {
		font-size: 11px;
		opacity: 0.7;
	}

	.tabs {
		display: flex;
		gap: 2px;
		padding: 0 12px;
		background: var(--bg-2);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.tabs button {
		padding: 10px 14px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-dim);
		font-size: 13px;
		border-radius: 0;
	}
	.tabs button:hover {
		color: var(--text);
		background: transparent;
	}
	.tabs button.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	.tabs .count {
		font-size: 10px;
		color: var(--text-faint);
		background: var(--bg-3);
		padding: 1px 6px;
		border-radius: 999px;
		margin-left: 4px;
	}

	.body {
		padding: 20px 24px;
		overflow-y: auto;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		margin-bottom: 20px;
	}
	.cell {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 10px 12px;
	}
	.cell-lbl {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
		margin-bottom: 4px;
	}
	.cell-val {
		font-size: 13px;
		word-break: break-word;
	}
	.loc-btn {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		text-align: left;
		color: inherit;
		font: inherit;
		cursor: pointer;
		display: block;
		width: 100%;
	}
	.loc-btn:hover strong {
		color: var(--accent);
		text-decoration: underline;
	}
	.muted {
		color: var(--text-faint);
	}
	.small {
		font-size: 11px;
	}
	.block {
		margin-top: 20px;
	}
	.block h3 {
		margin: 0 0 8px;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}
	.bio {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 12px;
		font-size: 13px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.bio-links {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.actions button {
		font-size: 12px;
	}
	.thumbs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 10px;
	}
	.thumb {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.thumb img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 4px;
	}
	.noimg {
		width: 100%;
		aspect-ratio: 1;
		background: var(--bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
		color: var(--text-faint);
		border-radius: 4px;
	}
	.tname {
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tbadge {
		font-size: 10px;
		color: var(--text-dim);
	}
	.badges-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 10px;
	}
	.badge-card {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 10px;
		text-align: center;
	}
	.badge-card img {
		width: 64px;
		height: 64px;
		object-fit: contain;
	}
	.bname {
		font-size: 12px;
		font-weight: 600;
		margin-top: 6px;
	}
	.bdate {
		font-size: 10px;
		color: var(--text-faint);
	}
	.empty {
		grid-column: 1 / -1;
		text-align: center;
		padding: 40px;
		color: var(--text-faint);
	}
	button.small {
		padding: 4px 10px;
		font-size: 12px;
	}
	button.danger {
		color: var(--danger);
	}
</style>
