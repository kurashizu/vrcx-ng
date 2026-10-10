<script>
	import Icon from '$lib/components/ui/Icon.svelte';
	import { api } from '$lib/client/api.js';
	import { createResource } from '$lib/client/resource.svelte.js';
	import { openUser, openWorld } from '$lib/stores/overlay.js';
	import { FEED_META, feedMeta } from '$lib/shared/feed.js';
	import { formatDuration, formatDateTime, timeAgo } from '$lib/shared/format.js';
	import Page from '$lib/components/ui/Page.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';

	const RANGES = [
		{ id: '1', label: '24 hours' },
		{ id: '7', label: '7 days' },
		{ id: '30', label: '30 days' },
		{ id: '90', label: '90 days' }
	];

	let days = $state('7');
	const res = createResource((d) => api('/api/stats', { query: { days: d } }));
	$effect(() => {
		res.load(days);
	});

	const data = $derived(res.data);
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

<Page title="Stats" icon="chart" subtitle="Computed from the stored feed; data accumulates from the day of deployment">
	{#snippet actions()}
		<Tabs variant="pill" bind:value={days} tabs={RANGES} />
	{/snippet}

	{#if res.loading && !data}
		<Notice kind="loading" />
	{:else if res.error}
		<Notice kind="error" text={res.error} onretry={() => res.load(days)} />
	{:else if data}
		<p class="muted small">
			{#if data.since}Recording since {formatDateTime(data.since)} ({timeAgo(data.since)}){:else}Nothing recorded yet{/if} · {total} feed entries
		</p>

		<section class="card">
			<h2><Icon name="users" /> Online time per friend <span class="faint small">counted from complete online → offline pairs</span></h2>
			{#if data.topOnline.length === 0}
				<Notice text="No data yet: a friend must come online and go offline once" />
			{:else}
				<ul class="bars">
					{#each data.topOnline as f (f.userId)}
						<li>
							<button class="name ellipsis" title={f.userId} onclick={() => openUser(f.userId)}>{f.displayName || f.userId}</button>
							<div class="track"><div class="fill" style:width="{(f.totalMs / onlineMax) * 100}%"></div></div>
							<span class="val">{formatDuration(f.totalMs)} <span class="faint small">· {f.sessions} sessions</span></span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card">
			<h2><Icon name="clock" /> Online hours <span class="faint small">local time, sign-ons per hour</span></h2>
			<div class="hours">
				{#each hourly as x (x.h)}
					<div class="col" title="{String(x.h).padStart(2, '0')}:00 · {x.c}×">
						<div class="bar" style:height="{(x.c / hourMax) * 100}%"></div>
						<span class="hl">{x.h % 3 === 0 ? x.h : ''}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="card">
			<h2><Icon name="globe" /> Popular worlds <span class="faint small">by number of friends who went there</span></h2>
			{#if data.topWorlds.length === 0}
				<Notice text="No data yet" />
			{:else}
				<ul class="bars">
					{#each data.topWorlds as w (w.worldId)}
						<li>
							<button class="name ellipsis" title={w.worldId} onclick={() => openWorld(w.worldId)}>{w.worldName || w.worldId}</button>
							<div class="track"><div class="fill alt" style:width="{(w.people / worldMax) * 100}%"></div></div>
							<span class="val">{w.people} friends <span class="faint small">· {w.visits} visits</span></span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card">
			<h2><Icon name="file" /> Feed types</h2>
			<div class="chips">
				{#each Object.entries(data.totals).sort((a, b) => b[1] - a[1]) as [type, c] (type)}
					<span class="chip"><Icon name={feedMeta(type).icon} /> {FEED_META[type]?.label || type} <strong>{c}</strong></span>
				{/each}
			</div>
		</section>
	{/if}
</Page>

<style>
	.card {
		padding: 16px 18px;
	}
	h2 {
		font-size: 14px;
		font-weight: 650;
		margin-bottom: 12px;
	}
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.bars li {
		display: grid;
		grid-template-columns: minmax(90px, 200px) 1fr minmax(90px, auto);
		align-items: center;
		gap: 12px;
	}
	.name {
		text-align: left;
	}
	.name:hover {
		color: var(--accent-ink);
		text-decoration: underline;
	}
	.track {
		height: 8px;
		border-radius: 8px;
		background: var(--bg-3);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: 8px;
		background: linear-gradient(90deg, var(--online), color-mix(in srgb, var(--online) 60%, var(--link)));
	}
	.fill.alt {
		background: linear-gradient(90deg, var(--accent), var(--link));
	}
	.val {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.hours {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 120px;
	}
	.col {
		flex: 1;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		gap: 4px;
	}
	.bar {
		width: 100%;
		min-height: 2px;
		border-radius: 3px 3px 0 0;
		background: var(--accent);
		opacity: 0.85;
	}
	.hl {
		height: 14px;
		font-size: 10px;
		color: var(--text-faint);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	@media (max-width: 640px) {
		.bars li {
			grid-template-columns: 1fr;
			gap: 2px;
		}
		.val {
			text-align: left;
		}
	}
</style>
