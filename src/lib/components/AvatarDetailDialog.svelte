<script>
	import { avatarDetailRequest, closeAvatarDetail } from '$lib/stores/avatarDetail.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { toasts } from '$lib/stores/toast.js';
	import { browser } from '$app/environment';

	let data = $state(null);
	let loading = $state(false);
	let error = $state('');
	let callerId = $state('');

	const req = $derived($avatarDetailRequest);

	const account = $derived(
		callerId ? $accounts.find((a) => a.id === callerId) : null
	);

	// ---- loading ----
	$effect(() => {
		if (!req?.avatarId) {
			data = null;
			error = '';
			return;
		}
		let cancelled = false;
		(async () => {
			loading = true;
			error = '';
			try {
				const r = await fetch(`/api/avatars/${encodeURIComponent(req.avatarId)}`);
				const j = await r.json();
				if (cancelled) return;
				if (!r.ok) {
					error = j.error || `HTTP ${r.status}`;
					data = null;
					return;
				}
				data = j;
				if (!callerId && j.selectableAccounts?.length) {
					callerId = j.selectableAccounts[0].id;
				}
			} catch (e) {
				if (!cancelled) error = e.message;
			} finally {
				if (!cancelled) loading = false;
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// ---- helpers ----
	function tags() {
		const t = data?.avatar?.tags || [];
		const out = [];
		for (const x of t) {
			if (typeof x === 'string') out.push(x);
			else if (x?.tag) out.push(x.tag);
		}
		return out;
	}
	const authorTags = $derived(tags().filter((t) => t.startsWith('author_tag')));
	const contentTags = $derived(tags().filter((t) => t.startsWith('content_')));
	const otherTags = $derived(tags().filter((t) => !t.startsWith('author_tag') && !t.startsWith('content_')));

	function platformInfo() {
		const pkgs = data?.avatar?.unityPackages || [];
		return pkgs.map((p) => {
			const platformLabel = {
				standalonewindows: 'PC',
				android: 'Quest',
				ios: 'iOS'
			}[p.platform] || p.platform;
			const rating = {
				Excellent: '极佳',
				Good: '良好',
				Medium: '中等',
				Poor: '较差',
				VeryPoor: '很差'
			}[p.performanceRating] || p.performanceRating;
			const size = p.fileSizeInBytes
				? (p.fileSizeInBytes / 1024 / 1024).toFixed(1) + ' MB'
				: '';
			return { platformLabel, rating, size, unityVersion: p.unityVersion };
		});
	}

	function releaseLabel(s) {
		return { public: '公开', private: '私有' }[s] || s || '?';
	}

	function dateOf(ts) {
		if (!ts) return '';
		try {
			return new Date(ts).toLocaleString();
		} catch {
			return '';
		}
	}

	function copy(text, okMsg) {
		if (!browser) return;
		navigator.clipboard.writeText(text).then(
			() => toasts.success(okMsg),
			() => toasts.error('复制失败')
		);
	}

	async function toggleFavorite() {
		if (!data?.avatar?.id) return;
		try {
			if (data.isFavorite) {
				await fetch(
					`/api/avatars/${encodeURIComponent(data.avatar.id)}/actions`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'unfavorite' })
					}
				);
				data.isFavorite = false;
				toasts.success('已取消收藏');
			} else {
				const r = await fetch(
					`/api/avatars/${encodeURIComponent(data.avatar.id)}/actions`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							action: 'favorite',
							groupName: 'group_0',
							meta: { name: data.avatar.name }
						})
					}
				);
				const j = await r.json();
				if (!j.ok) throw new Error(j.error || '失败');
				data.isFavorite = true;
				toasts.success('已加入收藏');
			}
		} catch (e) {
			toasts.error('收藏操作失败: ' + e.message);
		}
	}

	let selectBusy = $state(false);
	async function doSelect() {
		if (!callerId || !data?.avatar?.id) return;
		selectBusy = true;
		try {
			const r = await fetch(
				`/api/avatars/${encodeURIComponent(data.avatar.id)}/actions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'select', accountId: callerId })
				}
			);
			const j = await r.json();
			if (j.ok) toasts.success(`已切换为当前模型（${account?.displayName || ''}）`);
			else toasts.error('切换失败: ' + (j.error || '未知'));
		} catch (e) {
			toasts.error('切换失败: ' + e.message);
		} finally {
			selectBusy = false;
		}
	}
</script>

{#if req?.avatarId}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeAvatarDetail();
		}}
	>
		<div class="dialog" role="dialog" aria-modal="true">
			<button class="close" aria-label="关闭" onclick={closeAvatarDetail}>×</button>

			{#if loading}
				<div class="center muted">加载中…</div>
			{:else if error}
				<div class="center">
					<div class="err">⚠️ {error}</div>
				</div>
			{:else if data}
				{@const av = data.avatar}
				{@const pkgs = platformInfo()}

				<header class="hero">
					{#if av.thumbnailImageUrl}
						<img class="thumb" src={av.thumbnailImageUrl} alt={av.name} loading="lazy" />
					{:else}
						<div class="thumb noimg">?</div>
					{/if}
					<div class="hero-info">
						<h2 class="name" title={av.name}>{av.name}</h2>
						<div class="author-line">
							by
							<button class="link" onclick={() => openUserDetail(callerId, av.authorId)}>
								{av.authorName || av.authorId}
							</button>
						</div>
						<div class="badges">
							<span class="badge rel-{av.releaseStatus}">{releaseLabel(av.releaseStatus)}</span>
							{#each pkgs as p}
								<span class="badge plat">
									{p.platformLabel}
									{#if p.rating}<em>{p.rating}</em>{/if}
									{#if p.size}<em>{p.size}</em>{/if}
								</span>
							{/each}
							{#if av.featured}
								<span class="badge hot">🔥 精选</span>
							{/if}
						</div>
					</div>
				</header>

				<div class="actions">
					<button class="primary" disabled={selectBusy} onclick={doSelect}>
						{selectBusy ? '切换中…' : '🎭 换装'}
					</button>
					{#if data.selectableAccounts?.length > 1}
						<select class="ipt acc-sel" bind:value={callerId} title="使用账号">
							{#each data.selectableAccounts as a (a.id)}
								<option value={a.id}>{a.displayName} ({a.username})</option>
							{/each}
						</select>
					{/if}
					<button class="ghost" onclick={toggleFavorite}>
						{data.isFavorite ? '★ 已收藏' : '☆ 收藏'}
					</button>
					<button class="ghost" onclick={() => copy(av.id, '已复制模型 ID')}>📋 ID</button>
					<button class="ghost" onclick={() => copy(av.name, '已复制模型名')}>📋 名字</button>
				</div>

				<div class="body">
					{#if av.description}
						<section class="block">
							<p class="desc">{av.description}</p>
						</section>
					{/if}

					{#if authorTags.length || contentTags.length || otherTags.length || (av.styles && (av.styles.primary || av.styles.secondary))}
						<section class="block">
							<h3>标签</h3>
							<div class="tag-row">
								{#if av.styles?.primary}
									<span class="tag style" title="样式">🎨 {av.styles.primary}</span>
								{/if}
								{#if av.styles?.secondary}
									<span class="tag style" title="样式">🎨 {av.styles.secondary}</span>
								{/if}
								{#each contentTags as t}
									<span class="tag content" title={t}>{t.replace('content_', '')}</span>
								{/each}
								{#each authorTags as t}
									<span class="tag author" title={t}>{t.replace('author_tag_', '')}</span>
								{/each}
								{#each otherTags as t}
									<span class="tag">{t}</span>
								{/each}
							</div>
						</section>
					{/if}

					<section class="block">
						<h3>信息</h3>
						<div class="info-grid">
							<div class="kv">
								<span class="k">ID</span>
								<span class="v mono">{av.id}</span>
							</div>
							<div class="kv">
								<span class="k">版本</span>
								<span class="v">{av.version ?? '-'}</span>
							</div>
							<div class="kv">
								<span class="k">创建</span>
								<span class="v">{dateOf(av.created_at) || '-'}</span>
							</div>
							<div class="kv">
								<span class="k">更新</span>
								<span class="v">{dateOf(av.updated_at) || '-'}</span>
							</div>
							{#if av.unityPackageUrl}
								<div class="kv wide">
									<span class="k">Unity 包</span>
									<a class="v link" href={av.unityPackageUrl} target="_blank" rel="noreferrer">下载 ↗</a>
								</div>
							{/if}
						</div>
					</section>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		padding: 20px;
	}
	.dialog {
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 14px;
		width: 100%;
		max-width: 540px;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		position: relative;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.close {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-2);
		color: var(--text-dim);
		font-size: 18px;
		cursor: pointer;
		z-index: 3;
	}
	.close:hover {
		background: var(--bg-3);
		color: var(--text);
	}
	.center {
		padding: 60px 20px;
		text-align: center;
	}
	.err {
		color: var(--danger);
	}
	.hero {
		display: flex;
		gap: 14px;
		padding: 18px 18px 12px;
		border-bottom: 1px solid var(--border);
	}
	.thumb {
		width: 128px;
		height: 96px;
		border-radius: 10px;
		object-fit: cover;
		flex: none;
		background: var(--bg-2);
		border: 1px solid var(--border);
	}
	.thumb.noimg {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32px;
		color: var(--text-faint);
	}
	.hero-info {
		min-width: 0;
		flex: 1;
	}
	.name {
		margin: 0 0 4px;
		font-size: 17px;
		word-break: break-all;
	}
	.author-line {
		font-size: 12px;
		color: var(--text-dim);
		margin-bottom: 8px;
	}
	.link {
		background: none;
		border: none;
		padding: 0;
		color: var(--accent);
		cursor: pointer;
		font: inherit;
	}
	.link:hover {
		text-decoration: underline;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.badge {
		font-size: 10px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		color: var(--text-dim);
	}
	.badge em {
		font-style: normal;
		opacity: 0.75;
		border-left: 1px solid currentColor;
		margin-left: 5px;
		padding-left: 5px;
	}
	.badge.rel-public {
		background: rgba(61, 220, 151, 0.15);
		color: var(--online);
		border-color: rgba(61, 220, 151, 0.3);
	}
	.badge.rel-private {
		background: rgba(255, 180, 84, 0.12);
		color: var(--warn);
		border-color: rgba(255, 180, 84, 0.3);
	}
	.badge.hot {
		background: rgba(255, 120, 90, 0.15);
		color: #ff785a;
		border-color: rgba(255, 120, 90, 0.3);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 10px 18px;
		border-bottom: 1px solid var(--border);
		align-items: center;
	}
	.acc-sel {
		max-width: 160px;
	}
	.body {
		overflow-y: auto;
		padding: 4px 18px 16px;
	}
	.block {
		margin-top: 12px;
	}
	.block h3 {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-faint);
		margin: 0 0 6px;
	}
	.desc {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-dim);
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.tag {
		font-size: 11px;
		padding: 2px 8px;
		border-radius: 8px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		color: var(--text-dim);
	}
	.tag.content {
		background: rgba(255, 120, 90, 0.1);
		border-color: rgba(255, 120, 90, 0.25);
		color: #ff9a82;
	}
	.tag.author {
		background: rgba(124, 92, 255, 0.1);
		border-color: rgba(124, 92, 255, 0.25);
		color: #b39dff;
	}
	.tag.style {
		background: rgba(255, 200, 90, 0.1);
		border-color: rgba(255, 200, 90, 0.25);
		color: #ffcf6e;
	}
	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.kv {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 9px;
		min-width: 0;
	}
	.kv.wide {
		grid-column: 1 / -1;
	}
	.k {
		display: block;
		font-size: 10px;
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 2px;
	}
	.v {
		font-size: 12px;
		color: var(--text-dim);
		word-break: break-all;
	}
	.mono {
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}
</style>
