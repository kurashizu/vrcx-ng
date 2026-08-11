<script>
	import {
		worldDetailRequest,
		closeWorldDetail
	} from '$lib/stores/worldDetail.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { toasts } from '$lib/stores/toast.js';
	import { vrcLaunchUrl } from '$lib/shared/trust.js';
	import { parseLocation, accessTypeLabel, accessTypeColor } from '$lib/shared/location.js';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { timeAgo } from '$lib/shared/format.js';

	let data = $state(null);
	let loading = $state(false);
	let error = $state('');
	let inflight = null;
	let tab = $state('info'); // 'info' | 'instances' | 'friends'
	let favoriteAdding = $state(false);
	let isFavorite = $state(false);
	let memo = $state('');
	let inviterAccountId = $state('');
	let inviterMessage = $state('Hello, can I join you?');
	let inviteMode = $state('self'); // 'self' | 'create' | 'request'

	$effect(() => {
		const req = $worldDetailRequest;
		if (!req?.worldId) {
			data = null;
			error = '';
			return;
		}
		loadWorld(req.worldId, req.accountId);
		// Default the inviter to the requesting account, else first logged-in
		inviterAccountId = req.accountId || ($accounts.find((a) => a.loggedIn)?.id || '');
	});

	async function loadWorld(worldId, accountId) {
		inflight = worldId;
		loading = true;
		error = '';
		try {
			const url = `/api/worlds/${encodeURIComponent(worldId)}` +
				(accountId ? `?accountId=${encodeURIComponent(accountId)}` : '');
			const r = await fetch(url);
			const j = await r.json();
			if (inflight !== worldId) return;
			if (!r.ok) {
				error = j.error || `HTTP ${r.status}`;
				data = null;
			} else {
				data = j;
				memo = j?.memo || '';
				checkFavorite();
			}
		} catch (err) {
			error = err.message;
		} finally {
			if (inflight === worldId) loading = false;
		}
	}

	async function checkFavorite() {
		if (!data?.id) return;
		try {
			const r = await fetch(`/api/favorites?type=world&targetId=${data.id}`);
			const j = await r.json();
			isFavorite = (j.favorites || []).length > 0;
		} catch {}
	}

	async function toggleFavorite() {
		if (!data?.id || favoriteAdding) return;
		favoriteAdding = true;
		try {
			if (isFavorite) {
				await fetch(`/api/favorites?type=world&targetId=${data.id}`, { method: 'DELETE' });
				isFavorite = false;
				toasts.success('已取消收藏');
			} else {
				await fetch('/api/favorites', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						type: 'world',
						targetId: data.id,
						targetName: data.name,
						groupName: 'group_0'
					})
				});
				isFavorite = true;
				toasts.success('已加入收藏');
			}
		} catch (err) {
			toasts.error('操作失败: ' + err.message);
		} finally {
			favoriteAdding = false;
		}
	}

	function launch(instanceId = null) {
		const loc = instanceId && instanceId !== '0' ? `${data.id}:${instanceId}` : data.id;
		const u = vrcLaunchUrl(loc);
		if (!u) {
			toasts.error('无法生成启动链接');
			return;
		}
		if (browser) window.location.href = u;
	}

	// ----- Invite yourself into an existing instance -----
	let selfInviteBusy = $state(''); // location currently being processed

	async function selfInviteTo(location) {
		if (!inviterAccountId) {
			toasts.error('请选择账号');
			return;
		}
		if (!location) return;
		selfInviteBusy = location;
		try {
			const r = await fetch(
				`/api/accounts/${encodeURIComponent(inviterAccountId)}/instance-action`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'selfInvite', location })
				}
			);
			const j = await r.json();
			if (j.ok) toasts.success('已发送自我邀请 ✉️');
			else toasts.error('self-invite 失败: ' + (j.error || '未知错误'));
		} catch (err) {
			toasts.error('self-invite 失败: ' + err.message);
		} finally {
			selfInviteBusy = '';
		}
	}

	// ----- Create new instance -----
	let newInstAccess = $state('public'); // public | friends | friends+ | invite | invite+
	let newInstRegion = $state('us'); // us | use | eu | jp
	let newInstBusy = $state(false);
	let newInstResult = $state(null); // last created instance info

	async function createInstanceAndSelfInvite() {
		if (!inviterAccountId) {
			toasts.error('请选择账号');
			return;
		}
		if (!data?.id) return;
		newInstBusy = true;
		try {
			const typeMap = {
				public: 'public',
				friends: 'friends',
				'friends+': 'hidden',
				invite: 'private',
				'invite+': 'private'
			};
			const params = {
				action: 'createInstance',
				worldId: data.id,
				type: typeMap[newInstAccess],
				canRequestInvite: newInstAccess === 'invite+',
				region: newInstRegion
			};
			const r = await fetch(
				`/api/accounts/${encodeURIComponent(inviterAccountId)}/instance-action`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(params)
				}
			);
			const j = await r.json();
			if (!j.ok) {
				toasts.error(j.error || '创建实例失败');
				return;
			}
			newInstResult = j.instance;
			toasts.success('实例已创建');
		} catch (err) {
			toasts.error(err.message);
		} finally {
			newInstBusy = false;
		}
	}

	function launchCreatedInstance() {
		if (!newInstResult?.location) return;
		const u = vrcLaunchUrl(newInstResult.location);
		if (u && browser) window.location.href = u;
	}

	// ----- Request invite from a friend who owns a private/friends/friends+ instance -----
	let inviteTargetUserId = $state('');
	let inviteMessage = $state('Hello, can I join you?');
	let inviteBusy = $state(false);

	// Filter the API-provided friends-in-world list down to those we can
	// request invite from (have an ownerUserId) — i.e. private/friends/friends+
	// instances of our own friends.
	const friendsHere = $derived(data?.friendsInWorld || []);
	const inviteableFriends = $derived(
		friendsHere.filter((f) => f.ownerUserId && f.instanceType !== 'public' && !f.instanceType.startsWith('group'))
	);
	const friendOwnerOptions = $derived(inviteableFriends);

	$effect(() => {
		// Default the dropdown to the first inviteable friend
		if (!inviteTargetUserId && inviteableFriends.length > 0) {
			inviteTargetUserId = inviteableFriends[0].ownerUserId;
		}
	});

	async function sendInviteRequest() {
		if (!inviterAccountId) {
			toasts.error('请选择左边的账号作为邀请来源');
			return;
		}
		if (!inviteTargetUserId) {
			toasts.error('请选择要请求邀请的好友');
			return;
		}
		inviteBusy = true;
		try {
			const r = await fetch(
				`/api/accounts/${encodeURIComponent(inviterAccountId)}/instance-action`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'requestInvite',
						userId: inviteTargetUserId,
						message: inviteMessage
					})
				}
			);
			const j = await r.json();
			j.ok ? toasts.success('邀请请求已发送') : toasts.error(j.error || '失败');
		} catch (err) {
			toasts.error('失败: ' + err.message);
		} finally {
			inviteBusy = false;
		}
	}

	function copyId() {
		if (!data?.id) return;
		navigator.clipboard.writeText(data.id).then(
			() => toasts.success('已复制世界 ID'),
			() => toasts.error('复制失败')
		);
	}
	function copyName() {
		if (!data?.name) return;
		navigator.clipboard.writeText(data.name).then(
			() => toasts.success('已复制世界名'),
			() => toasts.error('复制失败')
		);
	}
	function copyUrl() {
		if (!data?.id) return;
		navigator.clipboard.writeText(`https://vrchat.com/home/world/${data.id}`).then(
			() => toasts.success('已复制 URL'),
			() => toasts.error('复制失败')
		);
	}

	function comma(n) {
		if (n == null) return '?';
		return Number(n).toLocaleString();
	}

	function tags() {
		const tags = data?.tags || [];
		const out = [];
		for (const t of tags) {
			if (typeof t === 'string') out.push(t);
			else if (t?.tag) out.push(t.tag);
		}
		return out;
	}

	const authorTags = $derived(tags().filter((t) => t.startsWith('author_tag')));
	const otherTags = $derived(tags().filter((t) => !t.startsWith('author_tag')));

	function descriptionHtml() {
		if (!data?.description) return '';
		return data.description.replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function dateOf(ts) {
		if (!ts) return '';
		try {
			return new Date(ts).toLocaleString();
		} catch {
			return '';
		}
	}

	const instances = $derived(data?.instances || []);

	// Which accounts are eligible to invite (logged in + connected)
	const eligibleAccounts = $derived(
		$accounts.filter((a) => a.loggedIn && a.connected)
	);

	</script>

{#if $worldDetailRequest?.worldId}
	<div
		class="modal-backdrop"
		onclick={(e) => { if (e.target === e.currentTarget) closeWorldDetail(); }}
		role="presentation"
	>
		<div class="dialog" role="dialog" aria-modal="true">
			<button class="close" onclick={closeWorldDetail} aria-label="关闭">×</button>

			{#if loading && !data}
				<div class="loading">
					<div class="spinner"></div>
					加载世界详情…
				</div>
			{:else if error}
				<div class="error">
					{error}
					<button class="ghost small" onclick={() => loadWorld($worldDetailRequest.worldId, $worldDetailRequest.accountId)}>
						重试
					</button>
				</div>
			{:else if data}
				<header class="hero">
					{#if data.imageUrl}
						<img class="hero-img" src={data.imageUrl} alt="" />
					{:else if data.thumbnailImageUrl}
						<img class="hero-img" src={data.thumbnailImageUrl} alt="" />
					{/if}
					<div class="hero-bg"></div>
					<div class="hero-content">
						<h2 class="world-name">{data.name || data.id}</h2>
						<div class="author-line">
							by <strong>{data.authorName || data.authorId || 'unknown'}</strong>
							{#if data.releaseStatus && data.releaseStatus !== 'public'}
								<span class="badge rel" data-s={data.releaseStatus}>{data.releaseStatus}</span>
							{/if}
							{#if data.unityPackages?.length}
								<span class="badge unity">{data.unityPackages[0]?.unityVersion || ''}</span>
							{/if}
						</div>
					</div>
				</header>

				<div class="actions">
					<button class="primary" onclick={() => launch()}>↗ 启动世界</button>
					<button class="ghost" onclick={toggleFavorite} disabled={favoriteAdding}>
						{isFavorite ? '★ 已收藏' : '☆ 收藏'}
					</button>
					<button class="ghost" onclick={copyId}>📋 ID</button>
					<button class="ghost" onclick={copyName}>📋 名字</button>
					<button class="ghost" onclick={copyUrl}>📋 URL</button>
					<a class="ghost" target="_blank" rel="noreferrer" href={`https://vrchat.com/home/world/${data.id}`}>
						🌐 网页
					</a>
				</div>

				<nav class="tabs">
					<button class:active={tab === 'info'} onclick={() => (tab = 'info')}>详情</button>
					<button class:active={tab === 'instances'} onclick={() => (tab = 'instances')}>
						实例 <span class="count">{instances.length}</span>
					</button>
				</nav>

				<div class="body">
					{#if tab === 'info'}
						<!-- Quick stats grid (VRCX-style) -->
						<section class="stats-grid">
							<div class="stat">
								<div class="stat-lbl">👥 当前在线</div>
								<div class="stat-val">
									{comma(data.occupants)}
									{#if data.publicOccupants != null && data.privateOccupants != null}
										<span class="stat-sub">
											({comma(data.publicOccupants)} 公开 / {comma(data.privateOccupants)} 私人)
										</span>
									{/if}
								</div>
							</div>
							<div class="stat">
								<div class="stat-lbl">⭐ 收藏</div>
								<div class="stat-val">
									{comma(data.favorites)}
									{#if data.favorites && data.visits}
										<span class="stat-sub">({Math.round((data.favorites / data.visits) * 100)}%)</span>
									{/if}
								</div>
							</div>
							<div class="stat">
								<div class="stat-lbl">👁 访问</div>
								<div class="stat-val">{comma(data.visits)}</div>
							</div>
							<div class="stat">
								<div class="stat-lbl">🪑 容量</div>
								<div class="stat-val">
									{comma(data.recommendedCapacity)} <span class="muted">推荐</span>
									{#if data.capacity != null && data.capacity !== data.recommendedCapacity}
										<span class="muted">/ {comma(data.capacity)} 最大</span>
									{/if}
								</div>
							</div>
							<div class="stat">
								<div class="stat-lbl">📅 创建</div>
								<div class="stat-val small">{dateOf(data.created_at) || '?'}</div>
							</div>
							<div class="stat">
								<div class="stat-lbl">🔄 更新</div>
								<div class="stat-val small">{dateOf(data.updated_at) || '?'}</div>
							</div>
						</section>

						{#if data.previewYoutubeId}
							<section class="block">
								<h3>📺 预览视频</h3>
								<a
									class="yt-link"
									target="_blank"
									rel="noreferrer"
									href={`https://www.youtube.com/watch?v=${data.previewYoutubeId}`}
								>
									https://www.youtube.com/watch?v={data.previewYoutubeId}
								</a>
							</section>
						{/if}

						{#if data.description}
							<section class="block">
								<h3>描述</h3>
								<pre class="desc">{descriptionHtml()}</pre>
							</section>
						{/if}

						{#if otherTags.length > 0 || authorTags.length > 0}
							<section class="block">
								{#if otherTags.length}
									<h3>标签</h3>
									<div class="tag-list">
										{#each otherTags as tag}
											<span class="tag">{tag}</span>
										{/each}
									</div>
								{/if}
								{#if authorTags.length}
									<h3 style="margin-top: 12px">作者标签</h3>
									<div class="tag-list">
										{#each authorTags as tag}
											<span class="tag author">{tag.replace(/^author_tag_/, '').replace(/_/g, ' ')}</span>
										{/each}
									</div>
								{/if}
							</section>
						{/if}

						{#if data.allowedDomains?.length}
							<section class="block">
								<h3>允许的域名</h3>
								<div class="tag-list">
									{#each data.allowedDomains as d}
										<span class="tag">{d}</span>
									{/each}
								</div>
							</section>
						{/if}

						{#if data.unityPackages?.length}
							<section class="block">
								<h3>Unity 包</h3>
								<div class="unity-list">
									{#each data.unityPackages as pkg}
										<div class="unity-row">
											<span class="unity-ver">{pkg.unityVersion}</span>
											{#if pkg.assetUrl}
												<span class="muted small">{pkg.assetUrl.split('/').pop()}</span>
											{/if}
										</div>
									{/each}
								</div>
							</section>
						{/if}

						<section class="block">
							<h3>ID</h3>
							<code class="wid">{data.id}</code>
						</section>

						<!-- Self-invite section: create new instance OR request invite from a friend -->
						<section class="block invite-self">
							<h3>✉️ 加入这个世界</h3>

							{#if eligibleAccounts.length === 0}
								<div class="muted small">请先在左边添加并登录一个账号</div>
							{:else}
								<label class="row">
									<span class="lbl">使用账号</span>
									<select bind:value={inviterAccountId} class="ipt">
										{#each eligibleAccounts as a (a.id)}
											<option value={a.id}>{a.displayName} ({a.username})</option>
										{/each}
									</select>
								</label>

									<div class="invite-tabs">
									<button
										class="invite-tab"
										class:active={inviteMode === 'self'}
										onclick={() => (inviteMode = 'self')}
									>邀请自己</button>
									<button
										class="invite-tab"
										class:active={inviteMode === 'create'}
										onclick={() => (inviteMode = 'create')}
									>创建新实例</button>
									<button
										class="invite-tab"
										class:active={inviteMode === 'request'}
										onclick={() => (inviteMode = 'request')}
									>请求好友邀请</button>
								</div>

								{#if inviteMode === 'self'}
									<div class="form-stack">
										<p class="muted small">
											对下方已存在的实例发送自我邀请（仅"邀请 / 邀请+"类型支持）。
											其他类型直接点 ↗ 启动加入即可。
										</p>
										{#if instances.length === 0}
											<div class="muted small">
												当前没有可见实例。可以切到「创建新实例」新建一个，或切到
												「请求好友邀请」请好友拉你。
											</div>
										{:else}
											<div class="instances">
												{#each instances as inst (inst.id || inst.instanceId)}
													{@const fullLoc = `${data.id}:${inst.id || inst.instanceId}`}
													{@const parsed = parseLocation(fullLoc)}
													<div class="inst-row">
														<div class="inst-main">
															<div class="inst-id-line">
																<span class="inst-id">{inst.id || inst.instanceId}</span>
																<span class="at-badge {accessTypeColor(parsed.accessTypeLabel)}">
																	{accessTypeLabel(parsed.accessTypeLabel)}
																</span>
																{#if parsed.region}
																	<span class="region-tag">{parsed.region.toUpperCase()}</span>
																{/if}
															</div>
															{#if inst.ownerName || inst.userName}
																<div class="inst-owner">
																	由 <strong>{inst.ownerName || inst.userName}</strong> 创建
																</div>
															{/if}
														</div>
														<div class="inst-occupants">
															{#if inst.occupants != null}
																👥 {inst.occupants}{inst.capacity ? `/${inst.capacity}` : ''}
																{/if}
															</div>
															<div class="inst-actions">
																<button
																class="inst-self"
																disabled={selfInviteBusy === fullLoc}
																title="发送自我邀请（所有访问类型均可用）"
																onclick={() => selfInviteTo(fullLoc)}
															>{selfInviteBusy === fullLoc ? '…' : '✉️'}</button>
																<button
																	class="inst-launch"
																	title="启动"
																	onclick={() => launch(inst.id || inst.instanceId)}
																>↗</button>
															</div>
														</div>
													{/each}
											</div>
										{/if}
									</div>
								{:else if inviteMode === 'create'}
									<div class="form-stack">
										<label class="row">
											<span class="lbl">访问类型</span>
											<select bind:value={newInstAccess} class="ipt">
												<option value="public">公开</option>
												<option value="friends">仅好友</option>
												<option value="friends+">好友+</option>
												<option value="invite">仅邀请</option>
												<option value="invite+">邀请+（可申请）</option>
											</select>
										</label>
										<label class="row">
											<span class="lbl">区域</span>
											<select bind:value={newInstRegion} class="ipt">
												<option value="us">US West</option>
												<option value="use">US East</option>
												<option value="eu">Europe</option>
												<option value="jp">Japan</option>
											</select>
										</label>
										<div class="row submit-row">
											<button
												class="primary small"
												disabled={newInstBusy}
												onclick={createInstanceAndSelfInvite}
											>{newInstBusy ? '创建中…' : '创建实例'}</button>
											{#if newInstResult?.location}
												<button class="ghost small" onclick={launchCreatedInstance}>
													↗ 启动刚创建的实例
												</button>
												<button class="ghost small" onclick={() => selfInviteTo(newInstResult.location)}>
													✉️ 邀请自己
												</button>
											{/if}
										</div>
										{#if newInstResult?.location}
											<p class="muted small mono">{newInstResult.location}</p>
											<p class="muted small">
												创建后可用「✉️ 邀请自己」发送自我邀请（所有访问类型均可用），或直接启动。
											</p>
										{/if}
									</div>
								{:else}
									<!-- request mode: pick a friend whose private/friends/friends+ instance you want to join -->
									<div class="form-stack">
										{#if friendOwnerOptions.length === 0}
											<div class="muted small">
												目前没有好友在这个世界拥有可邀请的实例（需要 invite / invite+ /
												friends / friends+ 类型）。
											</div>
										{:else}
											<label class="row">
												<span class="lbl">好友</span>
												<select bind:value={inviteTargetUserId} class="ipt">
													{#each friendOwnerOptions as f (f.userId + f.location)}
														<option value={f.ownerUserId}>
															{f.displayName} · {accessTypeLabel(f.accessTypeLabel)}
														</option>
													{/each}
												</select>
											</label>
											<label class="row">
												<span class="lbl">消息</span>
												<input
													type="text"
													class="ipt"
													placeholder="请求消息"
													bind:value={inviteMessage}
													maxlength="64"
												/>
											</label>
											<div class="row submit-row">
												<button
													class="primary small"
													disabled={inviteBusy}
													onclick={sendInviteRequest}
												>{inviteBusy ? '发送中…' : '发送邀请请求'}</button>
											</div>
										{/if}
									</div>
								{/if}
							{/if}
						</section>
					{:else if tab === 'instances'}
						<section class="block">
							<h3>活跃实例 ({instances.length})</h3>
							{#if instances.length === 0}
								<div class="muted">暂无公开实例</div>
							{:else}
								<div class="instances">
									{#each instances as inst (inst.id || inst.instanceId)}
										{@const fullLoc = `${data.id}:${inst.id || inst.instanceId}`}
										{@const parsed = parseLocation(fullLoc)}
										<div class="inst-row">
											<div class="inst-main">
												<div class="inst-id-line">
													<span class="inst-id">{inst.id || inst.instanceId}</span>
													<span class="at-badge {accessTypeColor(parsed.accessTypeLabel)}">
														{accessTypeLabel(parsed.accessTypeLabel)}
													</span>
													{#if parsed.region}
														<span class="region-tag">{parsed.region.toUpperCase()}</span>
													{/if}
												</div>
												{#if inst.ownerName || inst.userName}
													<div class="inst-owner">
														由 <strong>{inst.ownerName || inst.userName}</strong> 创建
													</div>
												{/if}
												{#if inst.platform}
													<div class="inst-platform">{inst.platform}</div>
												{/if}
											</div>
											<div class="inst-occupants">
												{#if inst.occupants != null}
													👥 {inst.occupants}{inst.capacity ? `/${inst.capacity}` : ''}
												{/if}
											</div>
											<div class="inst-actions">
												<button
													class="inst-launch"
													title="加入该实例"
													onclick={() => launch(inst.id || inst.instanceId)}
												>↗</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</section>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.dialog {
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 14px;
		width: 100%;
		max-width: 620px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.close {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		border: none;
		font-size: 18px;
		z-index: 2;
	}
	.close:hover {
		background: rgba(0, 0, 0, 0.8);
	}
	.loading {
		padding: 60px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--text-dim);
	}
	.spinner {
		width: 24px;
		height: 24px;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	.error {
		padding: 40px;
		text-align: center;
		color: var(--danger);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.hero {
		position: relative;
		min-height: 200px;
		overflow: hidden;
		flex-shrink: 0;
	}
	.hero-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.hero-bg {
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.7));
	}
	.hero-content {
		position: relative;
		padding: 22px 22px 18px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		min-height: 200px;
		color: white;
	}
	.world-name {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
	}
	.author-line {
		margin-top: 6px;
		font-size: 13px;
		opacity: 0.9;
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		background: rgba(255, 255, 255, 0.18);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}
	.badge.rel[data-s='public'] { background: rgba(61, 220, 151, 0.3); }
	.badge.rel[data-s='private'] { background: rgba(255, 180, 84, 0.3); }
	.badge.unity { background: rgba(124, 92, 255, 0.3); }
	.actions {
		display: flex;
		gap: 6px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-2);
		flex-shrink: 0;
		flex-wrap: wrap;
		align-items: center;
	}
	.actions button,
	.actions a {
		font-size: 12px;
		min-height: 30px;
		line-height: 1.2;
		text-decoration: none;
	}
	.actions a:hover {
		text-decoration: none;
	}
	.tabs {
		display: flex;
		gap: 4px;
		padding: 8px 14px 0;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.tabs button {
		padding: 6px 12px;
		background: transparent;
		border: none;
		color: var(--text-dim);
		font: inherit;
		font-size: 13px;
		border-radius: 6px 6px 0 0;
		cursor: pointer;
	}
	.tabs button.active {
		color: var(--text);
		background: var(--bg-2);
		border-bottom: 2px solid var(--accent);
	}
	.tabs .count {
		font-size: 10px;
		background: var(--bg-3);
		padding: 1px 5px;
		border-radius: 6px;
		margin-left: 3px;
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 14px 18px 22px;
	}
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px 12px;
		margin-bottom: 16px;
		padding: 12px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.stat {
		display: flex;
		flex-direction: column;
	}
	.stat-lbl {
		font-size: 11px;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.stat-val {
		font-size: 16px;
		font-weight: 600;
		color: var(--text);
		margin-top: 2px;
	}
	.stat-val.small {
		font-size: 12px;
		font-weight: normal;
	}
	.stat-sub {
		font-size: 11px;
		color: var(--text-dim);
		font-weight: normal;
		margin-left: 4px;
	}
	.block {
		margin-bottom: 18px;
	}
	.block h3 {
		margin: 0 0 8px;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dim);
		font-weight: 600;
	}
	.desc {
		margin: 0;
		font: inherit;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--text);
		font-size: 13px;
		line-height: 1.6;
		max-height: 240px;
		overflow-y: auto;
		background: var(--bg-2);
		border-radius: 6px;
		padding: 10px 12px;
	}
	.yt-link {
		display: block;
		padding: 8px 12px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-family: ui-monospace, monospace;
		font-size: 12px;
		color: var(--accent-2);
		text-decoration: none;
		word-break: break-all;
	}
	.yt-link:hover {
		background: var(--bg-3);
		text-decoration: none;
	}
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.tag {
		display: inline-block;
		padding: 2px 8px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 11px;
		color: var(--text-dim);
	}
	.tag.author {
		background: rgba(124, 92, 255, 0.12);
		border-color: rgba(124, 92, 255, 0.3);
		color: var(--accent);
	}
	.unity-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.unity-row {
		display: flex;
		justify-content: space-between;
		padding: 6px 10px;
		background: var(--bg-2);
		border-radius: 6px;
		font-size: 12px;
	}
	.unity-ver {
		font-family: ui-monospace, monospace;
		color: var(--accent);
	}
	.wid {
		display: block;
		padding: 6px 10px;
		background: var(--bg-2);
		border-radius: 6px;
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 11px;
		color: var(--text-dim);
		word-break: break-all;
	}
	.invite-self {
		background: var(--bg-2);
		padding: 12px 14px;
		border-radius: 10px;
		border: 1px solid var(--border);
	}
	.invite-self h3 {
		margin: 0 0 6px;
	}
	.invite-self > p {
		margin: 0 0 10px;
		line-height: 1.5;
	}
	.invite-form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.invite-form .row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.invite-form .row .lbl {
		flex: 0 0 44px;
		font-size: 12px;
		color: var(--text-dim);
		text-align: right;
	}
	.invite-form .ipt {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 13px;
		padding: 6px 8px;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		font: inherit;
	}
	.invite-form .submit-row {
		justify-content: flex-end;
	}
	.invite-form button {
		font-size: 12px;
		padding: 6px 12px;
	}
	.invite-tabs {
		display: flex;
		gap: 4px;
		margin: 6px 0 2px;
		border-bottom: 1px solid var(--border);
	}
	.invite-tab {
		flex: 1;
		padding: 6px 8px;
		background: transparent;
		border: none;
		border-radius: 0;
		color: var(--text-dim);
		font-size: 12px;
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.invite-tab.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	.form-stack {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 6px;
	}
	.mono {
		font-family: ui-monospace, monospace;
		word-break: break-all;
	}
	.instances {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 400px;
		overflow-y: auto;
	}
	.inst-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.inst-main {
		flex: 1;
		min-width: 0;
	}
	.inst-id-line {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.inst-id {
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 12px;
		color: var(--text);
	}
	.inst-owner {
		font-size: 11px;
		color: var(--text-dim);
		margin-top: 2px;
	}
	.inst-platform {
		font-size: 11px;
		color: var(--text-faint);
	}
	.inst-occupants {
		font-size: 12px;
		color: var(--text-dim);
		flex-shrink: 0;
	}
	.inst-launch,
	.inst-self {
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 14px;
	}
	.inst-self {
		background: rgba(124, 92, 255, 0.12);
		border-color: rgba(124, 92, 255, 0.35);
	}
	.inst-self:hover {
		background: rgba(124, 92, 255, 0.25);
	}
	.inst-self:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.at-badge {
		display: inline-block;
		padding: 1px 6px;
		font-size: 10px;
		font-weight: 600;
		border-radius: 6px;
		background: var(--bg-3);
		color: var(--text-dim);
		border: 1px solid var(--border);
	}
	.at-badge.at-public { background: rgba(61, 220, 151, 0.15); color: var(--online); border-color: rgba(61, 220, 151, 0.3); }
	.at-badge.at-invite { background: rgba(255, 180, 84, 0.15); color: var(--warn); border-color: rgba(255, 180, 84, 0.3); }
	.at-badge.at-invite-plus { background: rgba(255, 140, 80, 0.15); color: #ff8c50; border-color: rgba(255, 140, 80, 0.3); }
	.at-badge.at-friends { background: rgba(124, 92, 255, 0.15); color: var(--accent); border-color: rgba(124, 92, 255, 0.3); }
	.at-badge.at-friends-plus { background: rgba(178, 124, 255, 0.15); color: #b27cff; border-color: rgba(178, 124, 255, 0.3); }
	.at-badge.at-group,
	.at-badge.at-groupPublic,
	.at-badge.at-groupPlus { background: rgba(31, 184, 255, 0.15); color: var(--active); border-color: rgba(31, 184, 255, 0.3); }
	.region-tag {
		display: inline-block;
		padding: 1px 6px;
		font-size: 10px;
		font-weight: 700;
		border-radius: 6px;
		background: var(--bg-3);
		color: var(--text-dim);
		letter-spacing: 0.05em;
	}
	.muted {
		color: var(--text-dim);
	}
	.small {
		font-size: 11px;
	}
</style>
