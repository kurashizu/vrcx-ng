<script>
	import { api, run, accountPath } from '$lib/client/api.js';
	import Modal from '../ui/Modal.svelte';

	/** Edit an account's own status, bio, links and pronouns. @type {{ open: boolean, accountId: string, user: any, onSaved?: () => void }} */
	let { open = $bindable(false), accountId = '', user = null, onSaved } = $props();

	const STATUSES = [
		['active', '🟢 在线'],
		['join me', '🔵 加入我'],
		['ask me', '🟡 询问我'],
		['busy', '🔴 忙碌'],
		['offline', '⚫ 离线']
	];
	const MAX_LINKS = 3;

	let status = $state('active');
	let statusDescription = $state('');
	let bio = $state('');
	let links = $state(/** @type {string[]} */ ([]));
	let pronouns = $state('');
	let busy = $state(false);

	$effect(() => {
		if (!open || !user) return;
		status = user.status || 'active';
		statusDescription = user.statusDescription || '';
		bio = user.bio || '';
		links = [...(user.bioLinks || [])].slice(0, MAX_LINKS);
		pronouns = user.pronouns || '';
	});

	async function save() {
		busy = true;
		const body = { status, statusDescription, bio, pronouns, bioLinks: links.map((l) => l.trim()).filter(Boolean) };
		const ok = await run(() => api(`${accountPath(accountId)}/profile`, { method: 'POST', body }), '资料已保存');
		busy = false;
		if (ok) {
			open = false;
			onSaved?.();
		}
	}
</script>

{#if open}
	<Modal title="编辑个人资料" onclose={() => (open = false)}>
		<div class="stack form">
			<label class="field">
				<span class="lbl">状态</span>
				<select bind:value={status}>
					{#each STATUSES as [v, label] (v)}<option value={v}>{label}</option>{/each}
				</select>
			</label>
			<label class="field">
				<span class="lbl">状态描述（≤ 32）</span>
				<input bind:value={statusDescription} maxlength="32" placeholder="例如：在 VR 里摸鱼…" />
			</label>
			<label class="field">
				<span class="lbl">Bio（≤ 512）</span>
				<textarea bind:value={bio} maxlength="512" rows="4" placeholder="介绍一下自己…"></textarea>
			</label>
			<div class="field">
				<span class="lbl">Bio 链接（≤ {MAX_LINKS}）</span>
				{#each links as _, i (i)}
					<div class="row">
						<input type="url" bind:value={links[i]} placeholder="https://…" />
						<button class="btn ghost icon sm" title="移除" onclick={() => links.splice(i, 1)}>✕</button>
					</div>
				{/each}
				{#if links.length < MAX_LINKS}
					<button class="btn ghost sm add" onclick={() => links.push('')}>＋ 添加链接</button>
				{/if}
			</div>
			<label class="field">
				<span class="lbl">代词（≤ 32）</span>
				<input bind:value={pronouns} maxlength="32" placeholder="例如：she/her" />
			</label>
		</div>
		{#snippet footer()}
			<button class="btn ghost" onclick={() => (open = false)}>取消</button>
			<button class="btn primary" disabled={busy} onclick={save}>{busy ? '保存中…' : '保存'}</button>
		{/snippet}
	</Modal>
{/if}

<style>
	.form {
		gap: 14px;
	}
	.add {
		align-self: flex-start;
	}
</style>
