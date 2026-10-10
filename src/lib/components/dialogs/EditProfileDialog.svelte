<script>
	import Icon from '../ui/Icon.svelte';
	import { api, run, accountPath } from '$lib/client/api.js';
	import Modal from '../ui/Modal.svelte';

	/** Edit an account's own status, bio, links and pronouns. @type {{ open: boolean, accountId: string, user: any, onSaved?: () => void }} */
	let { open = $bindable(false), accountId = '', user = null, onSaved } = $props();

	const STATUSES = [
		['active', 'Online'],
		['join me', 'Join Me'],
		['ask me', 'Ask Me'],
		['busy', 'Busy'],
		['offline', 'Offline']
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
		const ok = await run(() => api(`${accountPath(accountId)}/profile`, { method: 'POST', body }), 'Profile saved');
		busy = false;
		if (ok) {
			open = false;
			onSaved?.();
		}
	}
</script>

{#if open}
	<Modal title="Edit profile" onclose={() => (open = false)}>
		<div class="stack form">
			<label class="field">
				<span class="lbl">Status</span>
				<select bind:value={status}>
					{#each STATUSES as [v, label] (v)}<option value={v}>{label}</option>{/each}
				</select>
			</label>
			<label class="field">
				<span class="lbl">Status message (≤ 32)</span>
				<input bind:value={statusDescription} maxlength="32" placeholder="e.g. Chilling in VR…" />
			</label>
			<label class="field">
				<span class="lbl">Bio (≤ 512)</span>
				<textarea bind:value={bio} maxlength="512" rows="4" placeholder="Tell people about yourself…"></textarea>
			</label>
			<div class="field">
				<span class="lbl">Bio links (≤ {MAX_LINKS})</span>
				{#each links as _, i (i)}
					<div class="row">
						<input type="url" bind:value={links[i]} placeholder="https://…" />
						<button class="btn ghost icon sm" title="Remove" onclick={() => links.splice(i, 1)}><Icon name="x" /></button>
					</div>
				{/each}
				{#if links.length < MAX_LINKS}
					<button class="btn ghost sm add" onclick={() => links.push('')}><Icon name="plus" /> Add link</button>
				{/if}
			</div>
			<label class="field">
				<span class="lbl">Pronouns (≤ 32)</span>
				<input bind:value={pronouns} maxlength="32" placeholder="e.g. she/her" />
			</label>
		</div>
		{#snippet footer()}
			<button class="btn ghost" onclick={() => (open = false)}>Cancel</button>
			<button class="btn primary" disabled={busy} onclick={save}>{busy ? 'Saving…' : 'Save'}</button>
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
