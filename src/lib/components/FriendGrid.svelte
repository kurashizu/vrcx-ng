<script>
import { vrImage } from '$lib/shared/format.js';
	import { friendGridOpen, closeFriendGrid } from '$lib/stores/friendGrid.js';
	import { friendsData } from '$lib/stores/friends.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { parseLocation, accessTypeLabel, accessTypeColor, shortInstanceLabel } from '$lib/shared/location.js';
	import { trustColor } from '$lib/shared/trust.js';
	import { onMount } from 'svelte';

	let query = $state('');
	let collapsed = $state({ offline: true });

	const STATUS_ORDER = [
		{ key: 'joinme', label: '🔵 加入我', status: 'join me' },
		{ key: 'online', label: '🟢 在线', status: '' },
		{ key: 'askme', label: '🟡 询问我', status: 'ask me' },
		{ key: 'busy', label: '🔴 忙碌', status: 'busy' },
		{ key: 'active', label: '🟣 活跃', status: 'active' },
		{ key: 'offline', label: '⚫ 离线', status: 'offline' }
	];

	// Group every friend into one of the smart buckets above.
	const buckets = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const match = (f) =>
			!q ||
			String(f.displayName || '').toLowerCase().includes(q) ||
			String(f.worldName || '').toLowerCase().includes(q) ||
			String(f.location || '').toLowerCase().includes(q);
		const out = {};
		for (const b of STATUS_ORDER) out[b.key] = [];
		for (const f of $friendsData.online) {
			if (!match(f)) continue;
			const st = f.status || '';
			if (st === 'join me') out.joinme.push(f);
			else if (st === 'ask me') out.askme.push(f);
			else if (st === 'busy') out.busy.push(f);
			else out.online.push(f);
		}
		for (const f of $friendsData.active) if (match(f)) out.active.push(f);
		for (const f of $friendsData.offline) if (match(f)) out.offline.push(f);
		for (const k of Object.keys(out)) {
			out[k].sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
		}
		return out;
	});

	const totalShown = $derived(
		STATUS_ORDER.reduce((s, b) => s + buckets[b.key].length, 0)
	);

	function accountLabel(accountId) {
		return $accounts.find((a) => a.id === accountId)?.displayName || '';
	}

	function instChip(f) {
		if (!f.location || f.location === 'offline' || f.location === 'private') return null;
		const parsed = parseLocation(f.location);
		if (!parsed?.worldId) return null;
		return {
			label: shortInstanceLabel(parsed) || '…',
			color: accessTypeColor(parsed.accessTypeLabel)
		};
	}

	function openUser(f) {
		// Keep the full-screen grid open underneath — dialogs layer on top of it.
		openUserDetail(f.accountIds || null, f.id, f.displayName);
	}

	let gridEl;
	onMount(() => {
		const onKey = (e) => {
			if (e.key === 'Escape') closeFriendGrid();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if $friendGridOpen}
	<div class="overlay">
		<header class="topbar">
			<div class="title">
				<span class="glow">▦</span> 好友总览
				<span class="count">{totalShown} 人</span>
			</div>
			<input
				type="search"
				class="search"
				placeholder="筛选好友 / 世界…"
				bind:value={query}
			/>
			<button class="close" onclick={closeFriendGrid} title="关闭 (Esc)">✕</button>
		</header>

		<div class="scroll">
			{#if totalShown === 0}
				<div class="empty">
					<p>没有匹配的好友</p>
				</div>
			{/if}

			{#each STATUS_ORDER as bucket (bucket.key)}
				{#if buckets[bucket.key].length > 0}
					<section class="bucket">
						<header
							class="bhead"
							class:collapsible={bucket.key === 'offline'}
							onclick={() => {
								if (bucket.key === 'offline') collapsed.offline = !collapsed.offline;
							}}
							role={bucket.key === 'offline' ? 'button' : undefined}
						>
							<h2 class="blabel">
								{bucket.label}
								<span class="n">{buckets[bucket.key].length}</span>
							</h2>
							{#if bucket.key === 'offline'}
								<span class="chev">{collapsed.offline ? '▸' : '▾'}</span>
							{/if}
						</header>

						{#if bucket.key === 'offline' && collapsed.offline}
							<div class="collapsed-hint">已折叠 {buckets.offline.length} 个离线好友</div>
						{:else}
							<div class="grid">
								{#each buckets[bucket.key] as f (f.id)}
									{@const chip = instChip(f)}
									{@const hue = trustColor(f) || '0'}
									<button
										class="card"
										class:bucket={bucket.key}
										onclick={() => openUser(f)}
										title={f.displayName}
									>
										<div class="avatar">
											{#if f.currentAvatarThumbnailImageUrl}
												<img src={vrImage(f.currentAvatarThumbnailImageUrl, f.accountIds?.[0] || '')} alt="" loading="lazy" />
											{:else}
												<div class="noimg" style:background={`hsl(${hue} 60% 30%)`}>
													{String(f.displayName || '?').slice(0, 1).toUpperCase()}
												</div>
											{/if}
											<span class="status-dot" class:bucket={bucket.key}></span>
											{#if f.accountIds?.length > 1}
												<span class="multi" title={`${f.accountIds.length} 个账号看到`}>×{f.accountIds.length}</span>
											{/if}
										</div>
										<div class="meta">
											<div class="name {trustColor(f)}" style:--trust-hue={hue}>{f.displayName}{#if f.vrcPlus}<span class="vrcplus" title="VRC+">◈+</span>{/if}</div>
											{#if f.statusDescription}
												<div class="sub">{f.statusDescription}</div>
											{/if}
											<div class="world" title={f.worldName || f.location}>
												{#if f.worldName}
													<span class="wname">🌍 {f.worldName}</span>
												{:else if f.location && f.location !== 'offline' && f.location !== 'private'}
													<span class="wname">🌍 未知世界</span>
												{/if}
												{#if chip}
													<span class="chip {chip.color}">{chip.label}</span>
												{/if}
											</div>
											{#if f.platform}
												<div class="plat">{f.platform === 'standalonewindows' ? '🖥 PC' : f.platform === 'android' ? '📱 Quest' : f.platform}</div>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</section>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: var(--bg-0);
		display: flex;
		flex-direction: column;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-1);
		flex: none;
	}
	.title {
		font-size: 16px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.glow {
		color: var(--accent);
	}
	.count {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-dim);
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px 10px;
	}
	.search {
		flex: 1;
		max-width: 420px;
		margin-left: auto;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		padding: 7px 12px;
		font-size: 13px;
		outline: none;
	}
	.search:focus {
		border-color: var(--accent);
	}
	.close {
		width: 34px;
		height: 34px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-2);
		color: var(--text-dim);
		font-size: 16px;
		cursor: pointer;
		flex: none;
	}
	.close:hover {
		background: var(--bg-3);
		color: var(--text);
	}
	.scroll {
		flex: 1;
		overflow-y: auto;
		padding: 16px 18px 60px;
	}
	.empty {
		padding: 80px 0;
		text-align: center;
		color: var(--text-faint);
	}
	.bucket {
		margin-bottom: 22px;
	}
	.bhead {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 2px 10px;
		cursor: default;
	}
	.bhead.collapsible {
		cursor: pointer;
	}
	.blabel {
		margin: 0;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dim);
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.n {
		font-size: 11px;
		font-weight: 700;
		color: var(--text-faint);
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 1px 8px;
	}
	.chev {
		color: var(--text-faint);
		font-size: 12px;
	}
	.collapsed-hint {
		font-size: 12px;
		color: var(--text-faint);
		padding: 8px 2px 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
		gap: 10px;
	}
	.card {
		display: flex;
		flex-direction: column;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		padding: 0;
		text-align: left;
		cursor: pointer;
		color: inherit;
		transition: transform 0.12s ease, border-color 0.12s ease;
	}
	.card:hover {
		transform: translateY(-2px);
		border-color: var(--accent);
	}
	.card.bucket-online { border-top: 3px solid var(--online); }
	.card.bucket-joinme { border-top: 3px solid var(--joinme, #6cb6ff); }
	.card.bucket-active { border-top: 3px solid var(--active); }
	.card.bucket-askme { border-top: 3px solid var(--warn); }
	.card.bucket-busy { border-top: 3px solid var(--danger); }
	.card.bucket-offline { opacity: 0.72; border-top: 3px solid var(--text-faint); }
	.avatar {
		position: relative;
		aspect-ratio: 4 / 3;
		background: var(--bg-2);
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.noimg {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 34px;
		font-weight: 800;
		color: rgba(255, 255, 255, 0.85);
	}
	.status-dot {
		position: absolute;
		left: 8px;
		bottom: 8px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--bg-1);
	}
	.status-dot.bucket-online { background: var(--online); }
	.status-dot.bucket-joinme { background: var(--joinme, #6cb6ff); }
	.status-dot.bucket-active { background: var(--active); }
	.status-dot.bucket-askme { background: var(--warn); }
	.status-dot.bucket-busy { background: var(--danger); }
	.status-dot.bucket-offline { background: var(--text-faint); }
	.multi {
		position: absolute;
		right: 6px;
		top: 6px;
		font-size: 10px;
		font-weight: 700;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		border-radius: 6px;
		padding: 1px 6px;
	}
	.meta {
		padding: 8px 10px 9px;
		min-width: 0;
	}
	.name {
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 1px;
	}
	.world {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 5px;
		min-width: 0;
	}
	.wname {
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chip {
		flex: none;
		font-size: 9px;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 5px;
	}
	.chip.at-public { background: rgba(61, 220, 151, 0.15); color: var(--online); }
	.chip.at-invite, .chip.at-invite-plus { background: rgba(255, 180, 84, 0.15); color: var(--warn); }
	.chip.at-friends, .chip.at-friends-plus { background: rgba(124, 92, 255, 0.15); color: var(--accent); }
	.chip.at-group, .chip.at-groupPublic, .chip.at-groupPlus { background: rgba(255, 200, 90, 0.15); color: #ffcf6e; }
	.plat {
		font-size: 10px;
		color: var(--text-faint);
		margin-top: 3px;
	}
	@media (max-width: 720px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		}
		.search {
			display: none;
		}
	}
</style>
