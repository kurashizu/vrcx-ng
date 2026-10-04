<script>
	import { api, run, accountPath } from '$lib/client/api.js';
	import Modal from '../ui/Modal.svelte';
	import Notice from '../ui/Notice.svelte';

	/**
	 * Add / move / remove one object (friend, world or avatar) in the account's
	 * VRChat favorite groups — the same groups the game and VRCX show.
	 *
	 * @type {{ open: boolean, accountId: string, kind: 'friend'|'world'|'avatar', objectId: string, title?: string }}
	 */
	let { open = $bindable(false), accountId, kind, objectId, title = 'VRChat 收藏' } = $props();

	let data = $state(/** @type {any} */ (null));
	let loading = $state(false);
	let error = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open && accountId) load();
	});

	async function load() {
		loading = true;
		error = '';
		try {
			data = await api(`${accountPath(accountId)}/vrc-favorites`);
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	// worlds can also live in the VRC+ groups
	const fits = (type) => (kind === 'world' ? type === 'world' || type === 'vrcPlusWorld' : type === kind);
	const groups = $derived((data?.groups || []).filter((g) => fits(g.type)));
	const current = $derived((data?.favorites || []).find((f) => f.favoriteId === objectId && fits(f.type)));

	const countOf = (g) => (data?.favorites || []).filter((f) => f.group === g.name && f.type === g.type).length;
	const limitOf = (g) => data?.limits?.maxFavoritesPerGroup?.[g.type] ?? null;

	async function choose(g) {
		if (busy || current?.group === g.name) return;
		busy = true;
		const ok = await run(
			() => api(`${accountPath(accountId)}/vrc-favorites`, { method: 'POST', body: { type: g.type, favoriteId: objectId, group: g.name } }),
			`已收藏到「${g.displayName}」`
		);
		busy = false;
		if (ok) open = false;
	}

	async function remove() {
		if (busy || !current) return;
		busy = true;
		const ok = await run(() => api(`${accountPath(accountId)}/vrc-favorites`, { method: 'DELETE', query: { favoriteId: objectId } }), '已取消收藏');
		busy = false;
		if (ok) open = false;
	}
</script>

{#if open}
	<Modal {title} size="sm" onclose={() => (open = false)}>
		{#if loading}
			<Notice kind="loading" />
		{:else if error}
			<Notice kind="error" text={error} onretry={load} />
		{:else if groups.length === 0}
			<Notice text="这个账号没有可用的收藏分组" />
		{:else}
			<ul>
				{#each groups as g (g.name)}
					{@const full = limitOf(g) != null && countOf(g) >= limitOf(g) && current?.group !== g.name}
					<li>
						<button class="grp" class:on={current?.group === g.name} disabled={busy || full} onclick={() => choose(g)}>
							<span>{current?.group === g.name ? '★' : '☆'} {g.displayName}</span>
							<span class="faint small">{countOf(g)}{limitOf(g) != null ? ` / ${limitOf(g)}` : ''}{full ? ' · 已满' : ''}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#snippet footer()}
			{#if current}<button class="btn danger" onclick={remove} disabled={busy}>取消收藏</button>{/if}
			<button class="btn ghost" onclick={() => (open = false)}>关闭</button>
		{/snippet}
	</Modal>
{/if}

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.grp {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border: 1px solid var(--border);
		border-radius: var(--r);
		background: var(--bg-2);
	}
	.grp:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.grp.on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.grp:disabled:not(.on) {
		opacity: 0.5;
	}
</style>
