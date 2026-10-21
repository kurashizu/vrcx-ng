<script>
	import { friendsData } from '$lib/stores/friends.js';
	import { settings } from '$lib/stores/settings.js';
	import { persisted } from '$lib/stores/persisted.js';
	import { matchFriend, groupByWorld, byName, byLastSeen } from '$lib/client/friends.js';
	import Page from '$lib/components/ui/Page.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import FriendCard from '$lib/components/friends/FriendCard.svelte';
	import WorldBoard from '$lib/components/friends/WorldBoard.svelte';

	const collapsed = persisted('friends.collapsed', /** @type {Record<string, boolean>} */ ({ offline: true }));
	/** worlds = world → instance → friends bubbles; grid = the flat tiles */
	const view = persisted('friends.view', 'worlds');
	let query = $state('');

	const q = $derived(query.trim().toLowerCase());
	const prep = (list) => list.filter((f) => matchFriend(f, q));

	const grouped = $derived(groupByWorld(prep($friendsData.online)));
	// biggest worlds first, so people sharing a world stay next to each other
	const inGame = $derived(grouped.worlds.flatMap((w) => [...w.friends].sort(byName)));
	const active = $derived(prep($friendsData.active).sort(byName));
	const offline = $derived(prep($friendsData.offline).sort($settings['friend.sortOfflineBy'] === 'name' ? byName : byLastSeen));

	const sum = (worlds) => worlds.reduce((n, w) => n + w.count, 0);

	const sections = $derived(
		[
			...($view === 'worlds'
				? [{ key: 'game', title: 'In game', dot: 'var(--online)', worlds: grouped.worlds, count: sum(grouped.worlds) }]
				: [{ key: 'game', title: 'In game', dot: 'var(--online)', list: inGame }]),
			{ key: 'traveling', icon: 'plane', title: 'Traveling', dot: 'var(--online)', list: grouped.traveling },
			{ key: 'incognito', icon: 'eye-off', title: 'Hidden', dot: 'var(--online)', list: grouped.incognito },
			{ key: 'active', title: 'Online (not in game)', dot: 'var(--active)', list: active },
			{ key: 'offline', title: 'Offline', dot: 'var(--offline)', list: offline }
		]
			.map((s) => ({ ...s, count: s.count ?? s.list.length }))
			.filter((s) => s.count)
	);
	const shown = $derived(sections.reduce((n, s) => n + s.count, 0));

	function setOpen(key, open) {
		const next = { ...$collapsed };
		if (open) delete next[key];
		else next[key] = true;
		collapsed.set(next);
	}
</script>

<Page title="Friends" icon="grid" subtitle={$view === 'worlds' ? 'Where your friends are: world → instance → friends' : 'Friends of all accounts merged into one grid'} width="wide">
	{#snippet actions()}
		<div class="seg" role="group" aria-label="View">
			<button class:on={$view === 'worlds'} onclick={() => view.set('worlds')} title="World → instance → friends"><Icon name="globe" /> Worlds</button>
			<button class:on={$view === 'grid'} onclick={() => view.set('grid')} title="Flat tiles"><Icon name="grid" /> Grid</button>
		</div>
		<span class="muted small">{shown} friends</span>
		<input type="search" class="search" placeholder="Filter friends / worlds…" bind:value={query} />
	{/snippet}

	{#if shown === 0}
		<Notice icon="users" text={$friendsData.total ? 'No matching friends' : 'No friend data yet'} />
	{/if}

	{#each sections as s (s.key)}
		<div class="block">
			<Section icon={s.icon} title={s.title} count={s.count} dot={s.dot} open={!$collapsed[s.key]} ontoggle={(o) => setOpen(s.key, o)}>
				{#if s.worlds}
					<WorldBoard worlds={s.worlds} />
				{:else}
					<div class="grid">
						{#each s.list as f (f.id)}
							<FriendCard friend={f} />
						{/each}
					</div>
				{/if}
			</Section>
		</div>
	{/each}
</Page>

<style>
	.seg {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: var(--r);
		overflow: hidden;
	}
	.seg button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 11px;
		color: var(--text-dim);
	}
	.seg button.on {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.search {
		width: 220px;
	}
	.block :global(.head) {
		padding-left: 2px;
		font-size: 13px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: 10px;
		padding: 6px 0 14px;
	}
</style>
