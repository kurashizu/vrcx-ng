<script>
	import { onMount } from 'svelte';
	import { toasts } from '$lib/stores/toast.js';
	import { vrImage } from '$lib/shared/format.js';
	import { trustColor } from '$lib/shared/trust.js';

	/** @type {{ open: boolean, accountId: string, location: string, onClose?: () => void }} */
	let {
		open = $bindable(false),
		accountId = '',
		location = '',
		onClose = undefined
	} = $props();

	function close() {
		open = false;
		onClose?.();
	}

	let friends = $state([]);
	let loading = $state(false);
	let query = $state('');
	let selected = $state(new Set());
	let inviting = $state(false);
	let inviteCount = $state(0);

	async function load() {
		if (!accountId) return;
		loading = true;
		try {
			const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/friends?n=2000`);
			const j = await r.json();
			friends = (j.friends || []).map((f) => ({ ...f }));
			selected = new Set();
		} catch {
			friends = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) load();
	});

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return friends;
		return friends.filter(
			(f) =>
				String(f.displayName || '').toLowerCase().includes(q) ||
				String(f.worldName || '').toLowerCase().includes(q) ||
				String(f.status || '').toLowerCase().includes(q)
		);
	});

	const allSelected = $derived(filtered.length > 0 && filtered.every((f) => selected.has(f.id)));

	function toggleAll() {
		if (allSelected) {
			for (const f of filtered) selected.delete(f.id);
		} else {
			for (const f of filtered) selected.add(f.id);
		}
		selected = new Set(selected);
	}

	function toggle(f) {
		if (selected.has(f.id)) selected.delete(f.id);
		else selected.add(f.id);
		selected = new Set(selected);
	}

	async function inviteAll() {
		if (selected.size === 0 || !accountId || !location) return;
		inviting = true;
		let ok = 0;
		const failed = [];
		const ids = [...selected];
		for (let i = 0; i < ids.length; i += 8) {
			const batch = ids.slice(i, i + 8);
			await Promise.all(
				batch.map(async (uid) => {
					try {
						const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/actions`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ action: 'invite', userId: uid, location })
						});
						const j = await r.json().catch(() => ({}));
						if (j.ok) ok++;
						else failed.push(uid);
					} catch {
						failed.push(uid);
					}
				})
			);
		}
		inviting = false;
		inviteCount = ok;
		if (ok > 0) toasts.success(`已向 ${ok} 位好友发送邀请`);
		if (failed.length > 0) {
			const names = failed
				.map((uid) => friends.find((f) => f.id === uid)?.displayName)
				.filter(Boolean)
				.slice(0, 3)
				.join('、');
			toasts.error(`${failed.length} 位邀请失败（${names}${failed.length > 3 ? '…' : ''}）`);
		}
		close();
	}
</script>

{#if open}
	<div class="backdrop" onclick={close}></div>
	<div class="panel" role="dialog" aria-label="邀请好友加入实例">
		<header>
			<span class="title">👥 邀请好友加入实例</span>
			<button class="ghost xs" onclick={close} aria-label="关闭">✕</button>
		</header>

		<div class="search-row">
			<input
				type="search"
				class="ipt"
				placeholder="按名字 / 世界 / 状态搜索…"
				bind:value={query}
			/>
			<span class="count">{selected.size} 已选</span>
		</div>

		<div class="list">
			{#if loading}
				<div class="muted small pad">加载好友列表…</div>
			{:else if filtered.length === 0}
				<div class="muted small pad">没有匹配的好友</div>
			{:else}
				<label class="row all-row">
					<input type="checkbox" checked={allSelected} onchange={toggleAll} />
					<span>全选当前结果（{filtered.length}）</span>
				</label>
				{#each filtered as f (f.id)}
					<label class="row friend">
						<input type="checkbox" checked={selected.has(f.id)} onchange={() => toggle(f)} />
						<div class="avatar">
							{#if f.currentAvatarThumbnailImageUrl}
								<img src={vrImage(f.currentAvatarThumbnailImageUrl, accountId)} alt="" loading="lazy" />
							{:else}
								<span>{String(f.displayName || '?').slice(0, 1).toUpperCase()}</span>
							{/if}
							<span class="state {f.state || 'offline'}" title={f.state}></span>
						</div>
						<div class="meta">
							<div class="nm {trustColor(f)}">{f.displayName}</div>
							<div class="sub">
								{#if f.worldName}
									🌍 {f.worldName}
								{:else if f.statusDescription}
									{f.statusDescription}
								{:else}
									{f.status || ''}
								{/if}
							</div>
						</div>
					</label>
				{/each}
			{/if}
		</div>

		<footer>
			<span class="muted small mono loc">{location}</span>
			<button class="primary" disabled={selected.size === 0 || inviting || !location} onclick={inviteAll}>
				{inviting ? '邀请中…' : `邀请所选好友（${selected.size}）`}
			</button>
		</footer>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 310;
	}
	.panel {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(460px, 94vw);
		max-height: 86vh;
		display: flex;
		flex-direction: column;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 14px;
		z-index: 320;
		overflow: hidden;
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		font-weight: 700;
		font-size: 14px;
	}
	.search-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
	}
	.search-row .ipt {
		flex: 1;
	}
	.count {
		font-size: 12px;
		color: var(--text-dim);
		white-space: nowrap;
	}
	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0 14px 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rows,
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.all-row {
		padding: 6px 4px;
		font-size: 12px;
		color: var(--text-dim);
		border-bottom: 1px solid var(--border);
		margin-bottom: 4px;
		cursor: pointer;
	}
	.friend {
		padding: 6px 4px;
		border-radius: 8px;
		cursor: pointer;
	}
	.friend:hover {
		background: var(--bg-2);
	}
	.friend input[type='checkbox'] {
		flex: none;
	}
	.avatar {
		position: relative;
		width: 34px;
		height: 34px;
		border-radius: 9px;
		overflow: hidden;
		flex: none;
		background: var(--bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		color: var(--text-dim);
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.avatar .state {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 2px solid var(--bg-1);
	}
	.avatar .state.online,
	.avatar .state.active {
		background: #3ddc97;
	}
	.avatar .state.offline {
		background: #555;
	}
	.meta {
		flex: 1;
		min-width: 0;
	}
	.nm {
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.nm.trust-visitor { color: var(--trust-visitor); }
	.nm.trust-newuser { color: var(--trust-newuser); }
	.nm.trust-user    { color: var(--trust-user); }
	.nm.trust-known   { color: var(--trust-known); }
	.nm.trust-trusted { color: var(--trust-trusted); }
	.nm.trust-veteran { color: var(--trust-veteran); }
	.nm.trust-legend  { color: var(--trust-legend); }

	.sub {
		font-size: 11px;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
	}
	.loc {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pad {
		padding: 12px 4px;
	}
</style>