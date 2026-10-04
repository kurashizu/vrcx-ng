<script>
	import { api, run, accountPath } from '$lib/client/api.js';
	import { toasts } from '$lib/stores/toast.js';
	import Modal from '../ui/Modal.svelte';
	import Notice from '../ui/Notice.svelte';

	/**
	 * Picker for the 12 preset messages VRChat keeps per kind ('message' = sent
	 * with an invite, 'request' = with a request-invite, 'response' /
	 * 'requestResponse' = decline replies). A slot can be rewritten first
	 * ("保存并发送"); VRChat puts an edited slot on a ~60 minute cooldown.
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

	let messages = $state(/** @type {{ slot: number, message: string, remainingCooldownMinutes?: number }[]} */ ([]));
	let loading = $state(false);
	let error = $state('');
	let editing = $state(/** @type {number | null} */ (null));
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
			messages = (await api(`${accountPath(accountId)}/invite-messages`, { query: { type } })).messages;
		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	const cooling = (m) => (m.remainingCooldownMinutes || 0) > 0;

	function pick(slot, message) {
		open = false;
		onPick?.(slot, message);
	}

	function startEdit(m) {
		editing = m.slot;
		draft = m.message;
	}

	async function save(m, thenSend) {
		const text = draft.trim();
		if (!text) return toasts.error('消息不能为空');
		busy = true;
		const ok =
			text === m.message ||
			(await run(() => api(`${accountPath(accountId)}/invite-messages`, { method: 'PUT', body: { type, slot: m.slot, message: text } }), '消息已更新'));
		busy = false;
		if (!ok) return;
		if (thenSend) pick(m.slot, text);
		else {
			editing = null;
			load();
		}
	}
</script>

{#if open}
	<Modal {title} size="sm" onclose={() => (open = false)}>
		{#if hint}<p class="muted small hint">{hint}</p>{/if}
		{#if loading}
			<Notice kind="loading" />
		{:else if error}
			<Notice kind="error" text={error} onretry={load} />
		{:else}
			<ul>
				{#each messages as m (m.slot)}
					<li>
						{#if editing === m.slot}
							<div class="edit">
								<textarea bind:value={draft} maxlength="64" rows="2" disabled={busy}></textarea>
								<div class="row">
									<span class="faint small">{draft.length}/64</span>
									<span class="spacer"></span>
									<button class="btn ghost xs" onclick={() => (editing = null)} disabled={busy}>取消</button>
									<button class="btn xs" onclick={() => save(m, false)} disabled={busy}>仅保存</button>
									<button class="btn primary xs" onclick={() => save(m, true)} disabled={busy}>保存并发送</button>
								</div>
							</div>
						{:else}
							<button class="slot" title="发送这条消息" onclick={() => pick(m.slot, m.message)}>
								<span class="n">{m.slot + 1}</span>
								<span class="t">{m.message}</span>
							</button>
							<button
								class="btn ghost icon sm"
								disabled={cooling(m)}
								onclick={() => startEdit(m)}
								title={cooling(m) ? `冷却中，约 ${m.remainingCooldownMinutes} 分钟后可再改` : '改写这条消息（改写后冷却约 60 分钟）'}
							>
								{cooling(m) ? `⏳` : '✏️'}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Modal>
{/if}

<style>
	.hint {
		margin-bottom: 10px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	li {
		display: flex;
		gap: 6px;
		align-items: stretch;
	}
	.edit {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.slot {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: var(--r);
		background: var(--bg-2);
	}
	.slot:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.n {
		flex: none;
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--bg-3);
		font-size: 11px;
		color: var(--text-dim);
	}
	.t {
		overflow-wrap: anywhere;
	}
</style>
