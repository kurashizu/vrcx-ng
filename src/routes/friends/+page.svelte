<script>
	import { friendsData } from '$lib/stores/friends.js';
	import { settings } from '$lib/stores/settings.js';
	import { persisted } from '$lib/stores/persisted.js';
	import { matchFriend, groupByWorld, byName, byLastSeen } from '$lib/client/friends.js';
	import Page from '$lib/components/ui/Page.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import FriendCard from '$lib/components/friends/FriendCard.svelte';

	const collapsed = persisted('friends.collapsed', /** @type {Record<string, boolean>} */ ({ offline: true }));
	let query = $state('');

	const q = $derived(query.trim().toLowerCase());
	const prep = (list) => list.filter((f) => matchFriend(f, q));

	const grouped = $derived(groupByWorld(prep($friendsData.online)));
	// biggest worlds first, so people sharing a world stay next to each other
	const inGame = $derived(grouped.worlds.flatMap((w) => [...w.friends].sort(byName)));
	const active = $derived(prep($friendsData.active).sort(byName));
	const offline = $derived(prep($friendsData.offline).sort($settings['friend.sortOfflineBy'] === 'name' ? byName : byLastSeen));

	const sections = $derived(
		[
			{ key: 'game', title: 'In game', dot: 'var(--online)', list: inGame },
			{ key: 'traveling', icon: 'plane', title: 'Traveling', dot: 'var(--online)', list: grouped.traveling },
			{ key: 'incognito', icon: 'eye-off', title: 'Hidden', dot: 'var(--online)', list: grouped.incognito },
			{ key: 'active', title: 'Online (not in game)', dot: 'var(--active)', list: active },
			{ key: 'offline', title: 'Offline', dot: 'var(--offline)', list: offline }
		].filter((s) => s.list.length)
	);
	const shown = $derived(sections.reduce((n, s) => n + s.list.length, 0));

	function setOpen(key, open) {
		const next = { ...$collapsed };
		if (open) delete next[key];
		else next[key] = true;
		collapsed.set(next);
	}
</script>

<Page title="Friends" icon="grid" subtitle="Friends of all accounts merged into one grid" width="wide">
	{#snippet actions()}
		<span class="muted small">{shown} friends</span>
		<input type="search" class="search" placeholder="Filter friends / worlds…" bind:value={query} />
	{/snippet}

	{#if shown === 0}
		<Notice icon="users" text={$friendsData.total ? 'No matching friends' : 'No friend data yet'} />
	{/if}

	{#each sections as s (s.key)}
		<div class="block">
			<Section icon={s.icon} title={s.title} count={s.list.length} dot={s.dot} open={!$collapsed[s.key]} ontoggle={(o) => setOpen(s.key, o)}>
				<div class="grid">
					{#each s.list as f (f.id)}
						<FriendCard friend={f} />
					{/each}
				</div>
			</Section>
		</div>
	{/each}
</Page>

<style>
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
