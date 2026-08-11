<script>
	import { accounts } from '$lib/stores/accounts.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { openWorldDetail } from '$lib/stores/worldDetail.js';
	import { openAvatarDetail } from '$lib/stores/avatarDetail.js';
	import { timeAgo } from '$lib/shared/format.js';

	function comma(n) {
		if (n == null) return '?';
		return Number(n).toLocaleString();
	}

	let query = $state('');
	let type = $state('friends'); // 'friends' | 'users' | 'worlds' | 'avatars'
	let busy = $state(false);
	let results = $state([]);
	let error = $state('');
	let lastQuery = '';
	let lastType = '';
	let inputEl;
	let accColorCache = new Map();

	function accColor(id) {
		if (!id) return '#888';
		if (accColorCache.has(id)) return accColorCache.get(id);
		let h = 0;
		for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
		const v = `hsl(${h % 360}, 60%, 50%)`;
		accColorCache.set(id, v);
		return v;
	}

	const TYPES = [
		{ id: 'friends', label: '我的好友', icon: '👥', hint: '本地缓存（所有账号，无需 API）' },
		{ id: 'users', label: '用户', icon: '👤', hint: '通过 VRChat API 搜索' },
		{ id: 'worlds', label: '世界', icon: '🌍', hint: '通过 VRChat API 搜索' },
		{ id: 'avatars', label: '模型', icon: '🎭', hint: '通过 VRChat API 搜索' }
	];

	let timer;
	$effect(() => {
		// re-run on type change immediately
		const t = type;
		clearTimeout(timer);
		timer = setTimeout(() => doSearch(), t === 'friends' ? 120 : 350);
	});

	async function doSearch() {
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			error = '';
			lastQuery = '';
			lastType = '';
			return;
		}
		busy = true;
		error = '';
		lastQuery = q;
		lastType = type;
		try {
			const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}&n=24`);
			const j = await r.json();
			if (lastQuery !== q || lastType !== type) return; // stale
			if (!r.ok || !j.ok) {
				error = j.error || `HTTP ${r.status}`;
				results = [];
			} else {
				results = j.results || [];
			}
		} catch (err) {
			error = err.message;
		} finally {
			busy = false;
		}
	}

	function openFriend(r) {
		const aId = r.accountIds?.[0];
		if (!aId) return;
		openUserDetail(aId, r.userId);
	}

	function openUserResult(r) {
		// r.id is the userId; r.accountId is the API account (caller)
		if (!r.id) return;
		openUserDetail(lastType === 'users' ? ($accounts.find((a) => a.loggedIn)?.id || '') : '', r.id);
	}

	function openWorldResult(r) {
		if (!r.id) return;
		openWorldDetail(r.id, $accounts.find((a) => a.loggedIn)?.id || '');
	}

	function trustRankClass(tags = []) {
		for (const t of tags) {
			if (typeof t !== 'string') continue;
			if (t.startsWith('system_trust_')) return `trust-${t.replace('system_trust_', '')}`;
		}
		return '';
	}

	function getTags(r) {
		if (Array.isArray(r.tags)) return r.tags;
		return [];
	}

	function stateDot(state) {
		if (state === 'online') return '🟢';
		if (state === 'active') return '🔵';
		return '⚫';
	}
</script>

<svelte:head>
	<title>搜索 — vrcx-ng</title>
</svelte:head>

<main class="search-page">
	<header class="search-header">
		<div class="search-top">
			<a href="/" class="back">← 返回</a>
			<h1>🔍 搜索</h1>
		</div>
		<div class="search-bar">
			<input
				bind:this={inputEl}
				bind:value={query}
				type="search"
				placeholder={type === 'friends' ? '搜索好友名字 / ID / 备注…' : '输入搜索关键词…'}
				autofocus
				enterkeyhint="search"
			/>
			{#if busy}
				<span class="spinner"></span>
			{/if}
		</div>

		<div class="type-tabs">
			{#each TYPES as t (t.id)}
				<button
					class:active={type === t.id}
					onclick={() => (type = t.id)}
					title={t.hint}
				>
					<span class="icn">{t.icon}</span>
					<span class="lbl">{t.label}</span>
				</button>
			{/each}
		</div>
	</header>

	<section class="results">
		{#if error}
			<div class="banner error">⚠ {error}</div>
		{:else if query.trim().length < 2}
			<div class="banner hint">至少输入 2 个字符开始搜索</div>
		{:else if busy && results.length === 0}
			<div class="banner hint">搜索中…</div>
		{:else if results.length === 0}
			<div class="banner hint">没有匹配的结果</div>
		{:else}
			<div class="count">共 {results.length} 条结果</div>

			{#if type === 'friends'}
				<ul class="list friends">
					{#each results as r (r.userId)}
						<li>
							<button class="row" onclick={() => openFriend(r)}>
								<img
									class="avatar"
									src={r.userThumbnailUrl || `https://api.vrchat.cloud/api/1/image/${r.userId}/1/256.jpg`}
									alt=""
									loading="lazy"
								/>
								<div class="info">
									<div class="name-line">
										<span class="dot {r.state}"></span>
										<span class="name {trustRankClass([])}">{r.displayName}</span>
										{#if r.status && r.status !== 'active'}
											<span class="status-pill status-{r.status.replace(/\s+/g, '-')}">{r.status}</span>
										{/if}
									</div>
									<div class="meta">
										<span>{r.userId}</span>
										{#if r.note}<span>· 备注: {r.note}</span>{/if}
										{#if r.location && r.location !== 'offline'}
											{#if r.worldName}<span>· 📍 {r.worldName}</span>{/if}
										{/if}
										{#if r.lastSeen}
											<span class="faint">· {timeAgo(new Date(r.lastSeen).toISOString())}</span>
										{/if}
									</div>
								</div>
								{#if r.accountIds?.length > 0}
									<div class="acc-pips">
										{#each r.accountIds.slice(0, 3) as aid (aid)}
											{@const a = $accounts.find((x) => x.id === aid)}
											<span
												class="acc-pip"
												style:--pip-color={accColor(aid)}
												title={a?.displayName || aid}
											>{a?.displayName?.slice(0, 1).toUpperCase() || '?'}</span>
										{/each}
										{#if r.accountIds.length > 3}
											<span class="more">+{r.accountIds.length - 3}</span>
										{/if}
									</div>
								{/if}
							</button>
						</li>
					{/each}
				</ul>

			{:else if type === 'users'}
				<ul class="list users">
					{#each results as r (r.id)}
						<li>
							<button class="row" onclick={() => openUserResult(r)}>
								<img
									class="avatar"
									src={r.currentAvatarThumbnailImageUrl || `https://api.vrchat.cloud/api/1/image/${r.id}/1/256.jpg`}
									alt=""
									loading="lazy"
								/>
								<div class="info">
									<div class="name-line">
										<span class="name {trustRankClass(getTags(r))}">{r.displayName}</span>
										{#if r.status && r.status !== 'active'}
											<span class="status-pill status-{r.status.replace(/\s+/g, '-')}">{r.status}</span>
										{/if}
										{#if r.developerType && r.developerType !== 'none'}
											<span class="dev-badge">{r.developerType}</span>
										{/if}
									</div>
									<div class="meta">
										<span>{r.id}</span>
										{#if r.bio}<span class="bio">· {r.bio.slice(0, 80)}{r.bio.length > 80 ? '…' : ''}</span>{/if}
										{#if r.last_login}
											<span class="faint">· {timeAgo(r.last_login)} 上线</span>
										{/if}
									</div>
								</div>
							</button>
						</li>
					{/each}
				</ul>

			{:else if type === 'worlds'}
				<ul class="list worlds">
					{#each results as r (r.id)}
						<li>
							<button class="row" onclick={() => openWorldResult(r)}>
								{#if r.imageUrl || r.thumbnailImageUrl}
									<img class="thumb" src={r.imageUrl || r.thumbnailImageUrl} alt="" loading="lazy" />
								{:else}
									<div class="thumb placeholder">🌍</div>
								{/if}
								<div class="info">
									<div class="name-line">
										<span class="name">{r.name}</span>
										{#if r.releaseStatus && r.releaseStatus !== 'public'}
											<span class="rel-badge rel-{r.releaseStatus}">{r.releaseStatus}</span>
										{/if}
									</div>
									<div class="meta">
										<span>by {r.authorName || r.authorId || '?'}</span>
										<span>· 👥 {comma(r.occupants || 0)}{r.capacity ? `/${r.capacity}` : ''}</span>
										<span>· ⭐ {comma(r.favorites || 0)}</span>
										<span>· 👁 {comma(r.visits || 0)}</span>
									</div>
								</div>
							</button>
						</li>
					{/each}
				</ul>

			{:else if type === 'avatars'}
				<ul class="list avatars">
					{#each results as r (r.id)}
						<li>
							<button class="row" onclick={() => openAvatarDetail(r.id, $accounts.find((a) => a.loggedIn)?.id || '')}>
								{#if r.thumbnailImageUrl || r.imageUrl}
									<img class="thumb" src={r.thumbnailImageUrl || r.imageUrl} alt="" loading="lazy" />
								{:else}
									<div class="thumb placeholder">🎭</div>
								{/if}
								<div class="info">
									<div class="name-line">
										<span class="name">{r.name}</span>
										{#if r.releaseStatus && r.releaseStatus !== 'public'}
											<span class="rel-badge rel-{r.releaseStatus}">{r.releaseStatus}</span>
										{/if}
									</div>
									<div class="meta">
										<span>by {r.authorName || r.authorId || '?'}</span>
										{#if r.description}
											<span class="bio">· {r.description.slice(0, 80)}{r.description.length > 80 ? '…' : ''}</span>
										{/if}
									</div>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>
</main>

<style>
	.search-page {
		max-width: 760px;
		margin: 0 auto;
		padding: 24px 18px 80px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.search-header h1 {
		margin: 0;
		font-size: 22px;
	}
	.search-top {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.back {
		color: var(--text-dim);
		font-size: 13px;
		text-decoration: none;
		padding: 4px 10px;
		border-radius: 6px;
		background: var(--bg-2);
		border: 1px solid var(--border);
	}
	.back:hover {
		background: var(--bg-3);
		color: var(--text);
		text-decoration: none;
	}
	.search-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		position: relative;
	}
	.search-bar input {
		flex: 1;
		font-size: 15px;
		padding: 10px 14px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
	}
	.search-bar input:focus {
		outline: none;
		border-color: var(--accent);
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	.type-tabs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.type-tabs button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		font-size: 13px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-dim);
		cursor: pointer;
	}
	.type-tabs button.active {
		background: var(--accent);
		border-color: var(--accent);
		color: white;
	}
	.type-tabs .icn {
		font-size: 14px;
	}

	.banner {
		padding: 16px;
		border-radius: 10px;
		text-align: center;
		font-size: 13px;
	}
	.banner.hint {
		background: var(--bg-2);
		color: var(--text-dim);
	}
	.banner.error {
		background: rgba(255, 93, 108, 0.1);
		color: var(--danger);
	}
	.count {
		font-size: 12px;
		color: var(--text-dim);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.list li {
		margin: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px 10px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		text-align: left;
		cursor: pointer;
		min-width: 0;
	}
	.row:hover {
		background: var(--bg-3);
		border-color: var(--border-strong);
	}
	.avatar,
	.thumb {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		border-radius: 8px;
		object-fit: cover;
		background: var(--bg-3);
	}
	.thumb.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.name-line {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot.online { background: var(--online); }
	.dot.active { background: var(--active); }
	.dot.offline { background: var(--offline); }
	.name {
		font-weight: 600;
		font-size: 14px;
		color: var(--text);
	}
	.name.trust-visitor { color: #aab0c4; }
	.name.trust-newuser { color: #4ec5ff; }
	.name.trust-user { color: #3ddc97; }
	.name.trust-known { color: #b27cff; }
	.name.trust-trusted { color: #ff8c50; }
	.name.trust-veteran { color: #ff5d6c; }
	.name.trust-legend { color: #ffb454; }
	.status-pill {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--bg-3);
		color: var(--text-dim);
	}
	.status-pill.status-join-me { background: rgba(108, 182, 255, 0.15); color: var(--joinme, #6cb6ff); }
	.status-pill.status-busy { background: rgba(255, 93, 108, 0.15); color: var(--danger); }
	.status-pill.status-ask-me { background: rgba(255, 180, 84, 0.15); color: var(--warn); }
	.dev-badge {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 6px;
		background: rgba(124, 92, 255, 0.18);
		color: var(--accent);
	}
	.meta {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		font-size: 11px;
		color: var(--text-dim);
		margin-top: 2px;
		overflow: hidden;
	}
	.meta > * {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bio {
		font-style: italic;
	}
	.faint {
		color: var(--text-faint);
	}
	.rel-badge {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 6px;
	}
	.rel-badge.rel-public { background: rgba(61, 220, 151, 0.15); color: var(--online); }
	.rel-badge.rel-private { background: rgba(255, 180, 84, 0.15); color: var(--warn); }
	.acc-pips {
		display: flex;
		gap: 3px;
		align-items: center;
		flex-shrink: 0;
	}
	.acc-pip {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--pip-color);
		color: white;
		font-size: 11px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--bg-1);
		text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
	}
	.more {
		font-size: 10px;
		color: var(--text-dim);
	}
</style>