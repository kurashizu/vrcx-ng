<script>
	import { toasts } from '$lib/stores/toast.js';

	/**
	 * Add / move / remove one object (friend, world or avatar) in the account's
	 * VRChat-side favorite groups — the same groups you see in-game and in VRCX.
	 *
	 * @type {{
	 *   open: boolean,
	 *   accountId: string,
	 *   kind: 'friend'|'world'|'avatar',
	 *   objectId: string,
	 *   title?: string,
	 *   onChange?: () => void
	 * }}
	 */
	let { open = $bindable(false), accountId, kind, objectId, title = 'VRChat 收藏', onChange } = $props();

	let data = $state(/** @type {any} */ (null));
	let loading = $state(false);
	let error = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open && accountId) load(false);
	});

	async function load(fresh) {
		loading = true;
		error = '';
		try {
			const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/vrc-favorites${fresh ? '?fresh=1' : ''}`);
			const j = await r.json();
			if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
			data = j;
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	// groups that can hold this kind of object (worlds also have VRC+ groups)
	const groups = $derived(
		(data?.groups || []).filter((g) => (kind === 'world' ? g.type === 'world' || g.type === 'vrcPlusWorld' : g.type === kind))
	);
	const current = $derived((data?.favorites || []).find((f) => f.favoriteId === objectId && (kind === 'world' ? f.type === 'world' || f.type === 'vrcPlusWorld' : f.type === kind)));

	function countOf(g) {
		return (data?.favorites || []).filter((f) => f.group === g.name && f.type === g.type).length;
	}
	function limitOf(g) {
		return data?.limits?.maxFavoritesPerGroup?.[g.type] ?? null;
	}

	async function choose(g) {
		if (busy || current?.group === g.name) return;
		busy = true;
		try {
			const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/vrc-favorites`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: g.type, favoriteId: objectId, group: g.name })
			});
			const j = await r.json().catch(() => ({}));
			if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
			toasts.success(`已收藏到「${g.displayName}」`);
			onChange?.();
			open = false;
		} catch (err) {
			toasts.error(err.message);
		} finally {
			busy = false;
		}
	}

	async function removeCurrent() {
		if (busy || !current) return;
		busy = true;
		try {
			const r = await fetch(
				`/api/accounts/${encodeURIComponent(accountId)}/vrc-favorites?favoriteId=${encodeURIComponent(objectId)}`,
				{ method: 'DELETE' }
			);
			const j = await r.json().catch(() => ({}));
			if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
			toasts.success('已取消 VRChat 收藏');
			onChange?.();
			open = false;
		} catch (err) {
			toasts.error(err.message);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />

{#if open}
	<div
		class="modal-backdrop"
		style="z-index: 600"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) open = false;
		}}
	>
		<div class="modal vfd" role="dialog" aria-modal="true" aria-label={title}>
			<h2>{title}</h2>
			{#if loading}
				<div class="muted">加载中…</div>
			{:else if error}
				<div class="error">{error}</div>
			{:else if groups.length === 0}
				<div class="muted">这个账号没有可用的收藏分组{kind === 'world' ? '' : ''}。</div>
			{:else}
				<ul class="groups">
					{#each groups as g (g.name)}
						{@const full = limitOf(g) != null && countOf(g) >= limitOf(g) && current?.group !== g.name}
						<li>
							<button class="grp" class:on={current?.group === g.name} disabled={busy || full} onclick={() => choose(g)}>
								<span class="name">{current?.group === g.name ? '★' : '☆'} {g.displayName}</span>
								<span class="muted cnt">{countOf(g)}{limitOf(g) != null ? ` / ${limitOf(g)}` : ''}{full ? ' · 已满' : ''}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="actions">
				{#if current}
					<button class="ghost danger" onclick={removeCurrent} disabled={busy}>取消收藏</button>
				{/if}
				<button class="ghost" onclick={() => (open = false)}>关闭</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.vfd {
		width: min(420px, 92vw);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.error {
		background: rgba(255, 93, 108, 0.12);
		border: 1px solid rgba(255, 93, 108, 0.3);
		color: var(--danger);
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
	}
	.groups {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.grp {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-2);
		color: inherit;
		cursor: pointer;
		text-align: left;
	}
	.grp:hover:not(:disabled) {
		border-color: var(--accent);
		background: var(--bg-3);
	}
	.grp.on {
		border-color: var(--accent);
	}
	.grp:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.cnt {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
</style>
