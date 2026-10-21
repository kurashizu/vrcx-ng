<script>
	import Icon from '../ui/Icon.svelte';
	import { accountName } from '$lib/stores/accounts.js';
	import { friendsData } from '$lib/stores/friends.js';
	import { openWorld, openInstance } from '$lib/stores/overlay.js';
	import { describeLocation } from '$lib/shared/location.js';
	import { accountsWithAccess, openJoinMenu } from '$lib/client/join.js';
	import { byName } from '$lib/client/friends.js';
	import { api } from '$lib/client/api.js';
	import { vrImage } from '$lib/shared/format.js';
	import AccessBadge from '../ui/AccessBadge.svelte';
	import PackBoard from '../ui/PackBoard.svelte';
	import FriendChip from './FriendChip.svelte';

	/**
	 * World → instance → friends as nested bubbles. A world card is tinted with a colour derived from the world id,
	 * crowded worlds are wider, an instance that one of our own accounts stands in is highlighted.
	 * @type {{ worlds: import('$lib/client/friends.js').WorldBucket[] }}
	 */
	let { worlds } = $props();

	/** worldId -> { image, thumb } (the world cover pictures; fetched in batches, the server fills the cache in the background) */
	let covers = $state(/** @type {Record<string, { image: string, thumb: string }>} */ ({}));
	let tries = 0;
	async function loadCovers() {
		const missing = worlds.filter((w) => !covers[w.worldId]);
		if (!missing.length) return;
		try {
			const r = await api('/api/worlds/covers', { query: { ids: missing.map((w) => w.worldId).join(','), accountId: missing[0].friends[0]?.accountIds?.[0] } });
			covers = { ...covers, ...r.covers };
			if (r.pending && tries++ < 8) setTimeout(loadCovers, 3000);
		} catch {}
	}
	$effect(() => {
		worlds.length;
		tries = 0;
		loadCovers();
	});
	/** small cards use the small picture */
	const coverOf = (w) => {
		const c = covers[w.worldId];
		const url = c && (small(w) ? c.thumb : c.image);
		return url ? vrImage(url, w.friends[0]?.accountIds?.[0] || '') : '';
	};

	/** a world with one friend gets a smaller card; it also fills the holes the bigger cards leave */
	const small = (w) => w.count < 2;

	const hue = (id) => {
		let h = 0;
		for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
		return h;
	};

	/**
	 * Columns a world card takes. Only really crowded worlds are wider: plenty of one-column cards is what lets the
	 * packer fill every hole (a board of only wide cards leaves a column empty).
	 */
	/** inside a world card the instances are packed too: busy ones take two or three of the inner columns */
	const instSpan = (i) => (i.count >= 8 ? 3 : i.count >= 4 ? 2 : 1);

	/** inner columns a world card of this span gets (the instance bubbles inside are packed into them) */
	const innerCols = (s) => (s === 1 ? 1 : s === 2 ? 3 : 5);

	/**
	 * Width of a world card, chosen from its content: the narrowest card whose last row of room bubbles is
	 * (nearly) full while the card does not get too tall. Crowded worlds are never narrower than their head count needs.
	 */
	const spanOf = (w) => {
		const need = w.count >= 20 ? 3 : w.count >= 10 ? 2 : 1;
		if (small(w)) return 1;
		const n = w.instances.length;
		let best = 1;
		let bestScore = Infinity;
		for (let s = 1; s <= 3; s++) {
			const c = innerCols(s);
			const rows = Math.ceil(n / c);
			const score = rows * c - n + 0.5 * (rows - 1) + 0.9 * (s - 1);
			if (score < bestScore - 1e-9) (bestScore = score), (best = s);
		}
		return Math.max(best, need);
	};

	/**
	 * Column spans of a world's room bubbles. When they would leave the last row ragged, the last bubbles are
	 * widened to fill it (3 columns, 2 rooms left → one takes 2 columns, the other 1).
	 */
	const instSpans = (w) => {
		const c = innerCols(spanOf(w));
		const spans = w.instances.map(instSpan);
		const rem = c > 1 && spans.every((x) => x === 1) ? spans.length % c : 0;
		if (rem) {
			let left = c;
			for (let k = 0; k < rem; k++) {
				const sp = Math.ceil(left / (rem - k));
				spans[spans.length - rem + k] = sp;
				left -= sp;
			}
		}
		return spans;
	};

	/** instance location -> our accounts that are in it right now */
	const here = $derived.by(() => {
		const m = new Map();
		for (const s of $friendsData.self || []) if (s.location) m.set(s.location, [...(m.get(s.location) || []), s.accountId]);
		return m;
	});
</script>

<PackBoard items={worlds.map((w) => ({ key: w.key, span: spanOf(w), data: w }))} gap={12} minCol={330}>
	{#snippet item(w)}
		{@const cover = coverOf(w)}
		{@const spans = instSpans(w)}
		<section class="world" class:compact={small(w)} class:cover={!!cover} style="--h: {hue(w.worldId)}; {cover ? `--cover: url('${cover}')` : ''}">
			<header>
				<button class="wname" title="Open world" onclick={() => openWorld(w.worldId, w.friends[0]?.accountIds?.[0] || '', '')}>
					<Icon name="globe" /><span class="ellipsis">{w.label}</span>
				</button>
				<span class="count" title="Friends in this world"><Icon name="users" /> {w.count}</span>
			</header>
			<PackBoard items={w.instances.map((i, k) => ({ key: i.key, span: spans[k], data: i }))} gap={8} minCol={200} maxCols={innerCols(spanOf(w))}>
				{#snippet item(inst)}
					{@const d = describeLocation(inst.location)}
					{@const mine = here.get(inst.location)}
					<div class="inst" class:mine={!!mine} class:single={inst.count === 1}>
						<div class="ihead">
							{#if d.parsed?.instanceName}<button class="iid mono" title="Open this instance" onclick={() => openInstance(inst.location, w.friends[0]?.accountIds?.[0] || '')}>#{d.parsed.instanceName}</button>{/if}
							<AccessBadge place={d} showPublic />
							{#if mine}<span class="you" title="One of your accounts is in this instance">You: {mine.map(accountName).join(', ')}</span>{/if}
							<span class="spacer"></span>
							{#if inst.count > 1}<span class="faint small"><Icon name="users" /> {inst.count}</span>{/if}
							{#if accountsWithAccess(inst.location).length}
								<button class="btn ghost icon xs" title="Join in game as…" onclick={(e) => openJoinMenu(e, inst.location)}><Icon name="play" /></button>
							{/if}
						</div>
						<div class="people">
							{#each [...inst.friends].sort(byName) as f (f.id)}
								<FriendChip friend={f} />
							{/each}
						</div>
					</div>
				{/snippet}
			</PackBoard>
		</section>
	{/snippet}
</PackBoard>

<style>
	.board {
		container-type: inline-size;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
		grid-auto-flow: dense;
		gap: 12px;
		padding: 6px 0 14px;
	}
	@container (min-width: 720px) {
		.world.big {
			grid-column: span 2;
		}
	}
	.world {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border: 1px solid hsl(var(--h) 45% 55% / 0.35);
		border-radius: 20px;
		background: linear-gradient(160deg, hsl(var(--h) 55% 55% / 0.14), hsl(var(--h) 55% 55% / 0.03) 70%), var(--bg-1);
	}
	/* the world's cover picture behind the card, darkened so the text and bubbles on it stay readable */
	.world.cover {
		background:
			linear-gradient(180deg, hsl(var(--h) 40% 10% / 0.55), hsl(var(--h) 40% 8% / 0.88) 70%),
			var(--cover) center / cover,
			var(--bg-1);
	}
	.world.cover .wname {
		color: #fff;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
	}
	.world.cover .inst {
		background: rgba(8, 10, 16, 0.62);
		backdrop-filter: blur(6px);
	}
	.world.compact {
		gap: 6px;
		padding: 9px 10px;
		border-radius: 16px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.wname {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		flex: 1;
		font-weight: 650;
		font-size: 14px;
		color: hsl(var(--h) 80% 78%);
		text-align: left;
	}
	.wname:hover {
		text-decoration: underline;
	}
	.count {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 8px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 650;
		background: hsl(var(--h) 55% 55% / 0.22);
	}
	.inst {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 9px 10px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: color-mix(in srgb, var(--bg-0) 55%, transparent);
	}
	.inst.mine {
		border-color: var(--online);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--online) 30%, transparent);
	}
	.ihead {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}
	button.iid:hover {
		color: var(--accent-ink);
		text-decoration: underline;
	}
	.iid {
		font-size: 12px;
		font-weight: 650;
		color: var(--text-dim);
	}
	.you {
		font-size: 11px;
		font-weight: 650;
		padding: 0 7px;
		border-radius: 999px;
		color: var(--online);
		background: color-mix(in srgb, var(--online) 16%, transparent);
	}
	.people {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
</style>
