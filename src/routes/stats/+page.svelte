<script>
	import { onMount } from 'svelte';
	import { accounts } from '$lib/stores/accounts.js';
	import { friendsData } from '$lib/stores/friends.js';
	import { openUserDetail } from '$lib/stores/userDetail.js';
	import { openWorldDetail } from '$lib/stores/worldDetail.js';
	import { formatDuration, timeAgo } from '$lib/shared/format.js';

	const RANGES = [
		{ days: 1, label: '24 小时' },
		{ days: 7, label: '7 天' },
		{ days: 30, label: '30 天' },
		{ days: 90, label: '90 天' }
	];

	let days = $state(7);
	let data = $state(/** @type {any} */ (null));
	let loading = $state(true);
	let error = $state('');

	// any logged-in account can open a world (it is only looked up)
	const viewAccount = $derived($accounts.find((a) => a.loggedIn)?.id || '');

	// A user must be opened through an account that is actually friends with
	// them, otherwise the dialog offers "send friend request" instead of the
	// friend actions (invite / request invite / favorite / …).
	function accountFor(userId) {
		for (const list of [$friendsData.online, $friendsData.active, $friendsData.offline]) {
			const f = list.find((x) => x.id === userId);
			if (f?.accountIds?.length) return f.accountIds[0];
		}
		return viewAccount;
	}

	async function load() {
		loading = true;
		error = '';
		try {
			const r = await fetch(`/api/stats?days=${days}`);
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			data = await r.json();
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	onMount(load);

	// the server counts per UTC hour; shift to the browser's local hour
	const hourly = $derived.by(() => {
		if (!data) return [];
		const shift = Math.round(-new Date().getTimezoneOffset() / 60);
		return Array.from({ length: 24 }, (_, h) => ({ h, c: data.hourly[(((h - shift) % 24) + 24) % 24] }));
	});
	const hourMax = $derived(Math.max(1, ...hourly.map((x) => x.c)));
	const onlineMax = $derived(Math.max(1, ...(data?.topOnline || []).map((x) => x.totalMs)));
	const worldMax = $derived(Math.max(1, ...(data?.topWorlds || []).map((x) => x.people)));
	const total = $derived(Object.values(data?.totals || {}).reduce((a, b) => a + b, 0));
</script>

<svelte:head>
	<title>统计 · vrcx-ng</title>
</svelte:head>

<main class="stats-page">
	<header>
		<div class="top">
			<a href="/" class="back">← 返回</a>
			<h1>📊 统计</h1>
		</div>
		<div class="ranges">
			{#each RANGES as r (r.days)}
				<button class:active={days === r.days} onclick={() => { days = r.days; load(); }}>{r.label}</button>
			{/each}
		</div>
	</header>

	{#if loading && !data}
		<div class="banner">加载中…</div>
	{:else if error}
		<div class="banner error">⚠ {error}</div>
	{:else if data}
		<p class="muted note">
			{#if data.since}数据从 {timeAgo(new Date(data.since).toISOString())}（{new Date(data.since).toLocaleString()}）开始记录，之后会越来越完整。{:else}还没有记录。{/if}
			共 {total} 条动态。
		</p>

		<section class="card">
			<h2>👥 好友在线时长 <span class="muted small">按完整的上线→下线计</span></h2>
			{#if data.topOnline.length === 0}
				<div class="muted">暂无数据（需要有好友完整地上线再下线一次）</div>
			{:else}
				<ul class="bars">
					{#each data.topOnline as f (f.userId)}
						<li>
							<button class="name" onclick={() => openUserDetail(accountFor(f.userId), f.userId)} title={f.userId}>
								{f.displayName || f.userId}
							</button>
							<div class="track"><div class="fill online" style:width="{(f.totalMs / onlineMax) * 100}%"></div></div>
							<span class="val">{formatDuration(f.totalMs)} <span class="muted small">· {f.sessions} 次</span></span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card">
			<h2>🕒 好友上线时段 <span class="muted small">本地时间，每小时上线人次</span></h2>
			<div class="hours">
				{#each hourly as x (x.h)}
					<div class="hcol" title={`${String(x.h).padStart(2, '0')}:00 · ${x.c} 次`}>
						<div class="hbar" style:height="{(x.c / hourMax) * 100}%"></div>
						<span class="hlbl">{x.h % 3 === 0 ? x.h : ''}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="card">
			<h2>🌍 热门世界 <span class="muted small">按去过的好友人数</span></h2>
			{#if data.topWorlds.length === 0}
				<div class="muted">暂无数据</div>
			{:else}
				<ul class="bars">
					{#each data.topWorlds as w (w.worldId)}
						<li>
							<button class="name" onclick={() => viewAccount && openWorldDetail(w.worldId, viewAccount)} title={w.worldId}>
								{w.worldName || w.worldId}
							</button>
							<div class="track"><div class="fill worlds" style:width="{(w.people / worldMax) * 100}%"></div></div>
							<span class="val">{w.people} 人 <span class="muted small">· {w.visits} 次</span></span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card">
			<h2>🧾 动态类型</h2>
			<div class="chips">
				{#each Object.entries(data.totals) as [type, c] (type)}
					<span class="chip">{type} <strong>{c}</strong></span>
				{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	.stats-page {
		max-width: 820px;
		margin: 0 auto;
		padding: 24px 18px 80px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h1 {
		margin: 0;
		font-size: 22px;
	}
	.top {
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
	}
	.ranges {
		display: flex;
		gap: 6px;
	}
	.ranges button {
		padding: 5px 12px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--bg-2);
		color: var(--text-dim);
		cursor: pointer;
	}
	.ranges button.active {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.banner {
		padding: 14px;
		border-radius: 10px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		text-align: center;
		color: var(--text-dim);
	}
	.banner.error {
		color: var(--danger);
	}
	.note {
		margin: 0;
		font-size: 13px;
	}
	.card {
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 14px 16px;
	}
	.card h2 {
		margin: 0 0 12px;
		font-size: 15px;
	}
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.bars li {
		display: grid;
		grid-template-columns: minmax(90px, 200px) 1fr minmax(90px, auto);
		gap: 10px;
		align-items: center;
	}
	.name {
		text-align: left;
		background: none;
		border: none;
		padding: 0;
		color: inherit;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name:hover {
		color: var(--accent);
	}
	.track {
		height: 10px;
		border-radius: 6px;
		background: var(--bg-3);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: 6px;
	}
	.fill.online {
		background: var(--online);
	}
	.fill.worlds {
		background: var(--accent);
	}
	.val {
		font-variant-numeric: tabular-nums;
		font-size: 13px;
		text-align: right;
		white-space: nowrap;
	}
	.hours {
		display: grid;
		grid-template-columns: repeat(24, 1fr);
		gap: 3px;
		height: 120px;
		align-items: end;
	}
	.hcol {
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		gap: 4px;
	}
	.hbar {
		width: 100%;
		min-height: 2px;
		border-radius: 3px 3px 0 0;
		background: var(--online);
	}
	.hlbl {
		height: 12px;
		font-size: 10px;
		color: var(--text-faint);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		font-size: 13px;
	}
	@media (max-width: 600px) {
		.bars li {
			grid-template-columns: 1fr;
			gap: 3px;
		}
		.val {
			text-align: left;
		}
	}
</style>
