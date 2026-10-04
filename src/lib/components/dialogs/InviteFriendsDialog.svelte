<script>
	import { friendList } from '$lib/stores/friends.js';
	import { toasts } from '$lib/stores/toast.js';
	import { act } from '$lib/client/actions.js';
	import { matchFriend } from '$lib/client/friends.js';
	import { shortId } from '$lib/shared/format.js';
	import Modal from '../ui/Modal.svelte';
	import Avatar from '../ui/Avatar.svelte';
	import UserName from '../ui/UserName.svelte';
	import Notice from '../ui/Notice.svelte';

	/** Invite several of an account's friends to one instance at once. @type {{ accountId: string, location: string, onclose: () => void }} */
	let { accountId, location, onclose } = $props();

	const RANK = { online: 0, active: 1, offline: 2 };

	let query = $state('');
	let selected = $state(new Set());
	let busy = $state(false);

	const friends = $derived(
		$friendList
			.filter((f) => f.accountIds.includes(accountId))
			.sort((a, b) => (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3) || a.displayName.localeCompare(b.displayName))
	);
	const q = $derived(query.trim().toLowerCase());
	const shown = $derived(friends.filter((f) => matchFriend(f, q)));
	const allSelected = $derived(shown.length > 0 && shown.every((f) => selected.has(f.id)));

	function toggle(id) {
		const next = new Set(selected);
		next.has(id) ? next.delete(id) : next.add(id);
		selected = next;
	}

	function toggleAll() {
		const next = new Set(selected);
		for (const f of shown) allSelected ? next.delete(f.id) : next.add(f.id);
		selected = next;
	}

	async function invite() {
		if (!selected.size || busy) return;
		busy = true;
		const ids = [...selected];
		const failed = [];
		// small parallel batches keep VRChat's rate limiter happy
		for (let i = 0; i < ids.length; i += 8) {
			await Promise.all(
				ids.slice(i, i + 8).map((id) =>
					act(accountId, 'invite', id, { location }).catch(() => failed.push(id))
				)
			);
		}
		busy = false;
		const ok = ids.length - failed.length;
		if (ok) toasts.success(`已向 ${ok} 位好友发送邀请`);
		if (failed.length) {
			const names = failed.map((id) => friends.find((f) => f.id === id)?.displayName).filter(Boolean);
			toasts.error(`${failed.length} 位邀请失败（${names.slice(0, 3).join('、')}${names.length > 3 ? '…' : ''}）`);
		}
		onclose();
	}
</script>

<Modal title="邀请好友加入实例" size="sm" onclose={onclose}>
	<div class="stack">
		<div class="row">
			<input type="search" placeholder="按名字 / 世界搜索…" bind:value={query} />
			<span class="faint small nowrap">已选 {selected.size}</span>
		</div>
		<div class="list">
			{#if shown.length === 0}
				<Notice text="没有匹配的好友" />
			{:else}
				<label class="item all">
					<input type="checkbox" checked={allSelected} onchange={toggleAll} />
					<span class="muted">全选当前结果（{shown.length}）</span>
				</label>
				{#each shown as f (f.id)}
					<label class="item">
						<input type="checkbox" checked={selected.has(f.id)} onchange={() => toggle(f.id)} />
						<Avatar src={f.currentAvatarThumbnailImageUrl} name={f.displayName} size={30} {accountId} presence={f.state} status={f.status} />
						<span class="who">
							<UserName user={f} />
							<span class="faint small ellipsis">{f.state === 'online' ? f.worldName || f.statusDescription || '在线' : f.state === 'active' ? '在线（未在游戏中）' : '离线'}</span>
						</span>
					</label>
				{/each}
			{/if}
		</div>
		<div class="faint small mono ellipsis" title={location}>{shortId(location)}</div>
	</div>
	{#snippet footer()}
		<button class="btn ghost" onclick={onclose}>取消</button>
		<button class="btn primary" disabled={!selected.size || busy} onclick={invite}>{busy ? '邀请中…' : `邀请所选（${selected.size}）`}</button>
	{/snippet}
</Modal>

<style>
	.nowrap {
		white-space: nowrap;
	}
	.list {
		max-height: 46dvh;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--r);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px;
		cursor: pointer;
	}
	.item:hover {
		background: var(--bg-2);
	}
	.all {
		position: sticky;
		top: 0;
		background: var(--bg-1);
		border-bottom: 1px solid var(--border);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
</style>
