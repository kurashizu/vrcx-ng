<script>
	import { addAccountOpen } from '$lib/stores/overlay.js';
	import { addAccount, loginAccount } from '$lib/stores/accounts.js';
	import Modal from '../ui/Modal.svelte';

	let username = $state('');
	let password = $state('');
	let displayName = $state('');
	let busy = $state(false);
	let error = $state('');

	function close() {
		addAccountOpen.set(false);
		username = password = displayName = error = '';
	}

	async function submit() {
		if (!username.trim() || !password) {
			error = 'Username and password are required';
			return;
		}
		error = '';
		busy = true;
		try {
			const acc = await addAccount(username.trim(), password, displayName.trim() || username.trim());
			// a second factor, if needed, is requested through the 2FA dialog
			await loginAccount(acc.id, { username: username.trim(), password });
			close();
		} catch (err) {
			error = err.message || 'Save failed';
		} finally {
			busy = false;
		}
	}
</script>

{#if $addAccountOpen}
	<Modal title="Add VRChat account" size="sm" onclose={close}>
		<form id="add-account" class="stack" onsubmit={(e) => (e.preventDefault(), submit())}>
			<p class="muted small">Credentials are stored encrypted on this machine and can be removed at any time.</p>
			<label class="field">
				<span class="lbl">Username or email</span>
				<input bind:value={username} autocomplete="username" data-autofocus />
			</label>
			<label class="field">
				<span class="lbl">Password</span>
				<input type="password" bind:value={password} autocomplete="current-password" />
			</label>
			<label class="field">
				<span class="lbl">Display name (optional)</span>
				<input bind:value={displayName} />
			</label>
			{#if error}<div class="error-text small">{error}</div>{/if}
		</form>
		{#snippet footer()}
			<button class="btn ghost" onclick={close} disabled={busy}>Cancel</button>
			<button class="btn primary" type="submit" form="add-account" disabled={busy}>{busy ? 'Logging in…' : 'Save & log in'}</button>
		{/snippet}
	</Modal>
{/if}
