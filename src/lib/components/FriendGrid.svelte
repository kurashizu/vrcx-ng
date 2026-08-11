<script>
import { vrImage } from '$lib/shared/format.js';
	import { friendGridOpen, closeFriendGrid } from '$lib/stores/friendGrid.js';
	import { friendsData } from '$lib/stores/friends.js';
	import { accounts } from '$lib/stores/accounts.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { openAvatarDetail } from '$lib/stores/avatarDetail.js';
	import { parseLocation, accessTypeLabel, accessTypeColor, shortInstanceLabel } from '$lib/shared/location.js';
	import { trustColor } from '$lib/shared/trust.js';
	import { onMount } from 'svelte';

	let query = $state('');
	let collapsed = $state({ offline: true });

	const byName = (a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''));

	// Smart full-screen grouping — mirrors the default list's smart mode:
	// online friends are grouped by world, then by instance inside a world
	// with more than one instance; incognito (online but private location),
	// active and offline friends get their own sections.
	const sections = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const match = (f) =>
			!q ||
			String(f.displayName || '').toLowerCase().includes(q) ||
			String(f.worldName || '').toLowerCase().includes(q) ||
			String(f.location || '').toLowerCase().includes(q);
		const incognito = [];
		const lone = [];
		const byWorld = new Map(); // worldId -> { worldId, worldName, instances: Map<instanceId, {label, friends}> }
		for (const f of $friendsData.online) {
			if (!match(f)) continue;
			const loc = String(f.location || '');
			if (!loc || loc === 'private' || loc === 'undefined') {
				incognito.push(f);
				continue;
			}
			if (loc === 'offline' || loc === 'traveling') {
				lone.push(f);
				continue;
			}
			const parsed = parseLocation(loc);
			const wid = parsed?.worldId;
			if (!wid) {
				lone.push(f);
				continue;
			}
			let wg = byWorld.get(wid);
			if (!wg) {
				wg = { worldId: wid, worldName: f.worldName || shortWorldId(wid), instances: new Map() };
				byWorld.set(wid, wg);
			}
			const instId = parsed.instanceId || loc;
			let ig = wg.instances.get(instId);
			if (!ig) {
				ig = { label: shortInstanceLabel(parsed) || '…', friends: [] };
				wg.instances.set(instId, ig);
			}
			ig.friends.push(f);
		}
		const worlds = Array.from(byWorld.values())
			.sort((a, b) => String(a.worldName).localeCompare(String(b.worldName)))
			.map((wg) => {
				const insts = Array.from(wg.instances.values());
				let total = 0;
				for (const ig of insts) {
					ig.friends.sort(byName);
					total += ig.friends.length;
				}
				insts.sort((a, b) => b.friends.length - a.friends.length);
				return { ...wg, instances: insts, count: total };
			});
		lone.sort(byName);
		incognito.sort(byName);
		const active = $friendsData.active.filter(match).sort(byName);
		const offline = $friendsData.offline
			.filter(match)
			.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

		const secs = [];
		if (worlds.length || lone.length) {
			secs.push({
				key: 'worlds',
				label: '🌍 在线 · 按世界',
				count: worlds.reduce((sum, w) => sum + w.count, 0) + lone.length,
				worlds,
				lone
			});
		}
		if (incognito.length) {
			secs.push({ key: 'incognito', label: '🙈 隐身中', count: incognito.length, friends: incognito });
		}
		if (active.length) secs.push({ key: 'active', label: '🟣 活跃', count: active.length, friends: active });
		if (offline.length) secs.push({ key: 'offline', label: '⚫ 离线', count: offline.length, friends: offline });
		return secs;
	});

	const totalShown = $derived(sections.reduce((sum, sec) => sum + sec.count, 0));

	function shortWorldId(wid) {
		const m = String(wid || '').match(/wrld_[0-9a-f]{4}$/i);
		return m ? m[0] : String(wid || '…').slice(0, 8);
	}

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

			{#each sections as sec (sec.key)}
				<section class="bucket">
					<header
						class="bhead"
						class:collapsible={sec.key === 'offline'}
						onclick={() => {
							if (sec.key === 'offline') collapsed.offline = !collapsed.offline;
						}}
						role={sec.key === 'offline' ? 'button' : undefined}
					>
						<h2 class="blabel">
							{sec.label}
							<span class="n">{sec.count}</span>
						</h2>
						{#if sec.key === 'offline'}
							<span class="chev">{collapsed.offline ? '▸' : '▾'}</span>
						{/if}
					</header>

					{#if sec.key === 'offline' && collapsed.offline}
						<div class="collapsed-hint">已折叠 {sec.count} 个离线好友</div>
					{:else if sec.worlds}
						{#each sec.worlds as wg (wg.worldId)}
							<div class="world-head">
								<span class="ww">🌍</span>
								<span class="wname">{wg.worldName}</span>
								<span class="n">{wg.count}</span>
							</div>
							{#if wg.instances.length > 1}
								{#each wg.instances as ig (ig.label)}
									<div class="inst-head">↳ {ig.label}</div>
									<div class="grid">
										{#each ig.friends as f (f.id)}
											{@const chip = instChip(f)}
											{@const hue = trustColor(f) || '0'}
											<button
												class="card"
												class:bucket={sec.key}
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
													<span class="status-dot" class:bucket={sec.key}></span>
													{#if f.accountIds?.length > 1}
														<span class="multi" title={`${f.accountIds.length} 个账号看到`}>×{f.accountIds.length}</span>
													{/if}
													{#if f.currentAvatar}
														<button
															class="av-open"
															title="查看模型"
															onclick={(e) => { e.stopPropagation(); openAvatarDetail(f.currentAvatar, f.accountIds?.[0] || ''); }}
														>🧍</button>
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
								{/each}
							{:else}
								<div class="grid">
									{#each wg.instances[0].friends as f (f.id)}
										{@const chip = instChip(f)}
										{@const hue = trustColor(f) || '0'}
										<button
											class="card"
											class:bucket={sec.key}
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
												<span class="status-dot" class:bucket={sec.key}></span>
												{#if f.accountIds?.length > 1}
													<span class="multi" title={`${f.accountIds.length} 个账号看到`}>×{f.accountIds.length}</span>
												{/if}
												{#if f.currentAvatar}
													<button
														class="av-open"
														title="查看模型"
														onclick={(e) => { e.stopPropagation(); openAvatarDetail(f.currentAvatar, f.accountIds?.[0] || ''); }}
													>🧍</button>
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
						{/each}
						{#if sec.lone.length > 0}
							<div class="grid">
								{#each sec.lone as f (f.id)}
									{@const chip = instChip(f)}
									{@const hue = trustColor(f) || '0'}
									<button
										class="card"
										class:bucket={sec.key}
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
											<span class="status-dot" class:bucket={sec.key}></span>
											{#if f.accountIds?.length > 1}
												<span class="multi" title={`${f.accountIds.length} 个账号看到`}>×{f.accountIds.length}</span>
											{/if}
											{#if f.currentAvatar}
												<button
													class="av-open"
													title="查看模型"
													onclick={(e) => { e.stopPropagation(); openAvatarDetail(f.currentAvatar, f.accountIds?.[0] || ''); }}
												>🧍</button>
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
					{:else}
						<div class="grid">
							{#each sec.friends as f (f.id)}
								{@const chip = instChip(f)}
								{@const hue = trustColor(f) || '0'}
								<button
									class="card"
									class:bucket={sec.key}
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
										<span class="status-dot" class:bucket={sec.key}></span>
										{#if f.accountIds?.length > 1}
											<span class="multi" title={`${f.accountIds.length} 个账号看到`}>×{f.accountIds.length}</span>
										{/if}
										{#if f.currentAvatar}
											<button
												class="av-open"
												title="查看模型"
												onclick={(e) => { e.stopPropagation(); openAvatarDetail(f.currentAvatar, f.accountIds?.[0] || ''); }}
											>🧍</button>
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
	.world-head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 4px 2px 10px;
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: 8px;
		padding: 6px 10px;
	}
	.world-head .ww {
		flex: none;
	}
	.world-head .wname {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.inst-head {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-dim);
		padding: 6px 2px 4px;
		letter-spacing: 0.02em;
	}
	.n {
		flex: none;
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
	.card.bucket-worlds { border-top: 3px solid var(--online); }
	.card.bucket-incognito { border-top: 3px solid var(--text-faint); opacity: 0.85; }
	.card.bucket-active { border-top: 3px solid var(--active); }
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
	.status-dot.bucket-worlds { background: var(--online); }
	.status-dot.bucket-incognito { background: var(--text-faint); }
	.status-dot.bucket-active { background: var(--active); }
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