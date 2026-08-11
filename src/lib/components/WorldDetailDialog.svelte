<script>
	import {
		worldDetailRequest,
		closeWorldDetail
	} from '$lib/stores/worldDetail.js';
	import { toasts } from '$lib/stores/toast.js';
	import { vrcLaunchUrl } from '$lib/shared/trust.js';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let data = $state(null);
	let loading = $state(false);
	let error = $state('');
	let inflight = null;
	let favoritesAdding = $state(false);
	let isFavorite = $state(false);
	let favoriteGroup = $state('group_0');

	$effect(() => {
		const req = $worldDetailRequest;
		if (!req?.worldId) {
			data = null;
			error = '';
			return;
		}
		loadWorld(req.worldId, req.accountId);
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
			}
		} catch (err) {
			error = err.message;
		} finally {
			if (inflight === worldId) loading = false;
		}
	}

	function launch(instanceId = null) {
		const loc = instanceId && instanceId !== '0'
			? `${data.id}:${instanceId}`
			: data.id;
		const u = vrcLaunchUrl(loc);
		if (!u) {
			toasts.error('无法生成启动链接');
			return;
		}
		if (browser) window.location.href = u;
	}

	function copyId() {
		if (!data?.id) return;
		navigator.clipboard.writeText(data.id).then(
			() => toasts.success('已复制世界 ID'),
			() => toasts.error('复制失败')
		);
	}

	function capacityLabel() {
		const rec = data?.recommendedCapacity ?? 0;
		const cap = data?.capacity ?? 0;
		if (!rec && !cap) return '?';
		return `${rec}–${cap}`;
	}

	function tags() {
		const tags = data?.tags || [];
		const out = [];
		for (const t of tags) {
			if (typeof t === 'string') {
				out.push(t);
			} else if (t?.tag) {
				out.push(t.tag);
			}
		}
		return out;
	}

	function descriptionHtml() {
		if (!data?.description) return '';
		// VRChat descriptions are plain text with \n; just keep as-is
		return data.description.replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	const instances = $derived(data?.instances || []);
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
					{#if data.thumbnailImageUrl}
						<img class="hero-img" src={data.thumbnailImageUrl} alt="" />
					{/if}
					<div class="hero-bg"></div>
					<div class="hero-content">
						<h2 class="world-name">{data.name || data.id}</h2>
						<div class="author-line">
							by <strong>{data.authorName || data.authorId || 'unknown'}</strong>
							{#if data.releaseStatus}
								<span class="badge rel" data-s={data.releaseStatus}>{data.releaseStatus}</span>
							{/if}
						</div>
						<div class="badges">
							<span class="badge">👥 {capacityLabel()}</span>
							{#if data.visits}
								<span class="badge">👁 {data.visits.toLocaleString()} 次访问</span>
							{/if}
							{#if data.favorites}
								<span class="badge">⭐ {data.favorites.toLocaleString()} 收藏</span>
							{/if}
							{#if data.publicOccupants != null}
								<span class="badge live">🟢 {data.publicOccupants} 公开实例</span>
							{/if}
							{#if data.privateOccupants != null}
								<span class="badge">🔒 {data.privateOccupants} 私人实例</span>
							{/if}
						</div>
					</div>
				</header>

				<div class="actions">
					<button class="primary" onclick={() => launch()}>↗ 在 VRChat 中打开</button>
					<button class="ghost" onclick={copyId}>📋 复制 ID</button>
					<a class="ghost" target="_blank" rel="noreferrer" href={`https://vrchat.com/home/world/${data.id}`}>
						🌐 在网页打开
					</a>
				</div>

				<div class="body">
					{#if data.description}
						<section class="block">
							<h3>描述</h3>
							<pre class="desc">{descriptionHtml()}</pre>
						</section>
					{/if}

					{#if tags().length}
						<section class="block">
							<h3>标签</h3>
							<div class="tag-list">
								{#each tags() as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						</section>
					{/if}

					<section class="block">
						<h3>ID</h3>
						<code class="wid">{data.id}</code>
					</section>

					{#if instances.length > 0}
						<section class="block">
							<h3>活跃公开实例 ({instances.length})</h3>
							<div class="instances">
								{#each instances as inst (inst.id || inst.instanceId)}
									{@const fullLoc = `${data.id}:${inst.id || inst.instanceId}`}
									<div class="inst-row">
										<div class="inst-main">
											<div class="inst-id">{inst.id || inst.instanceId}</div>
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
												👥 {inst.occupants}
											{/if}
											{#if inst.capacity}
												/{inst.capacity}
											{/if}
										</div>
										<button
											class="inst-launch"
											onclick={() => launch(inst.id || inst.instanceId)}
											title="加入该实例"
										>↗</button>
									</div>
								{/each}
							</div>
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
		max-width: 560px;
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
		min-height: 180px;
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
		min-height: 180px;
		color: white;
	}
	.world-name {
		margin: 0;
		font-size: 22px;
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
	}
	.badges {
		display: flex;
		gap: 6px;
		margin-top: 10px;
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
	.badge.live {
		background: rgba(61, 220, 151, 0.3);
		border-color: rgba(61, 220, 151, 0.5);
	}
	.actions {
		display: flex;
		gap: 6px;
		padding: 12px 18px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-2);
		flex-shrink: 0;
	}
	.actions a {
		display: inline-flex;
		align-items: center;
		padding: 6px 12px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		border-radius: 8px;
		text-decoration: none;
		color: var(--text);
		font-size: 12px;
	}
	.actions a:hover {
		background: #2a2f4a;
		text-decoration: none;
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 16px 18px 24px;
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
		max-height: 200px;
		overflow-y: auto;
		background: var(--bg-2);
		border-radius: 6px;
		padding: 10px 12px;
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
	.instances {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 280px;
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
	}
	.inst-launch {
		width: 32px;
		height: 32px;
		padding: 0;
		font-size: 14px;
	}
</style>
