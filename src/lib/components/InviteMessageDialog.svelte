<script>
	import { toasts } from '$lib/stores/toast.js';

	/**
	 * Picker for VRChat's 12 preset messages of one kind
	 * ('message' = with an invite, 'request' = with a request-invite,
	 *  'response' / 'requestResponse' = decline replies).
	 * Clicking a slot calls onPick(slot, text); a slot can also be edited first
	 * ("保存并发送"). VRChat puts an edited slot on a ~60 min cooldown.
	 *
	 * @type {{
	 *   open: boolean,
	 *   accountId: string,
	 *   type: 'message'|'request'|'response'|'requestResponse',
	 *   title?: string,
	 *   hint?: string,
	 *   onPick: (slot: number, message: string) => void
	 * }}
	 */
	let { open = $bindable(false), accountId, type = 'request', title = '选择消息', hint = '', onPick } = $props();

	let messages = $state(/** @type {{slot:number,message:string,remainingCooldownMinutes?:number}[]} */ ([]));
	let loading = $state(false);
	let error = $state('');
	let editing = $state(/** @type {number|null} */ (null));
	let draft = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open && accountId) {
			editing = null;
			load();
		}
	});

	async function load() {
		loading = true;
		error = '';
		try {
			const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/invite-messages?type=${type}`);
			const j = await r.json();
			if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
			messages = j.messages;
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	function pick(m) {
		open = false;
		onPick?.(m.slot, m.message);
	}

	function startEdit(m) {
		editing = m.slot;
		draft = m.message;
	}

	async function saveEdit(m, thenSend) {
		const text = draft.trim();
		if (!text) {
			toasts.error('消息不能为空');
			return;
		}
		busy = true;
		try {
			if (text !== m.message) {
				const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/invite-messages`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ type, slot: m.slot, message: text })
				});
				const j = await r.json().catch(() => ({}));
				if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
				toasts.success('消息已更新');
			}
			if (thenSend) {
				open = false;
				onPick?.(m.slot, text);
			} else {
				editing = null;
				await load();
			}
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
		<div class="modal imd" role="dialog" aria-modal="true" aria-label={title}>
			<h2>{title}</h2>
			{#if hint}<p class="muted hint">{hint}</p>{/if}

			{#if loading}
				<div class="muted">加载中…</div>
			{:else if error}
				<div class="error">{error}</div>
			{:else}
				<ul class="slots">
					{#each messages as m (m.slot)}
						<li>
							{#if editing === m.slot}
								<textarea bind:value={draft} maxlength="64" rows="2" disabled={busy}></textarea>
								<div class="edit-row">
									<span class="muted count">{draft.length}/64</span>
									<button class="ghost xs" onclick={() => (editing = null)} disabled={busy}>取消</button>
									<button class="ghost xs" onclick={() => saveEdit(m, false)} disabled={busy}>仅保存</button>
									<button class="primary xs" onclick={() => saveEdit(m, true)} disabled={busy}>保存并发送</button>
								</div>
							{:else}
								<button class="slot" onclick={() => pick(m)} title="发送这条消息">
									<span class="n">{m.slot + 1}</span>
									<span class="t">{m.message}</span>
								</button>
								<button
									class="ghost edit"
									onclick={() => startEdit(m)}
									disabled={(m.remainingCooldownMinutes || 0) > 0}
									title={(m.remainingCooldownMinutes || 0) > 0
										? `冷却中，约 ${m.remainingCooldownMinutes} 分钟后可再修改`
										: '修改这条消息（修改后会冷却约 60 分钟）'}
								>
									{(m.remainingCooldownMinutes || 0) > 0 ? `⏳ ${m.remainingCooldownMinutes}m` : '✏️'}
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			<div class="actions">
				<button class="ghost" onclick={() => (open = false)}>取消</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.imd {
		width: min(520px, 92vw);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.hint {
		font-size: 13px;
		margin: 0 0 10px;
	}
	.error {
		background: rgba(255, 93, 108, 0.12);
		border: 1px solid rgba(255, 93, 108, 0.3);
		color: var(--danger);
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
	}
	.slots {
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
	.slots li {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: stretch;
	}
	.slot {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		text-align: left;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-2);
		color: inherit;
		cursor: pointer;
	}
	.slot:hover {
		border-color: var(--accent);
		background: var(--bg-3);
	}
	.slot .n {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--bg-3);
		color: var(--text-dim);
		font-size: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.slot .t {
		word-break: break-word;
	}
	.edit {
		flex-shrink: 0;
		min-width: 40px;
	}
	textarea {
		width: 100%;
		resize: vertical;
	}
	.edit-row {
		width: 100%;
		display: flex;
		gap: 6px;
		align-items: center;
		justify-content: flex-end;
	}
	.count {
		margin-right: auto;
		font-size: 12px;
	}
</style>
