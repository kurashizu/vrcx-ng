<script>
	import { twofaRequest, loginAccount, accountName } from '$lib/stores/accounts.js';
	import { toasts } from '$lib/stores/toast.js';
	import Modal from '../ui/Modal.svelte';

	const LABELS = {
		totp: ['Authenticator app', '6-digit code from Google Authenticator, Authy, etc.'],
		emailotp: ['Email code', 'VRChat emails a 6-digit code to the account address'],
		otp: ['Recovery code', 'One-time 8-character recovery code']
	};

	let method = $state('totp');
	let code = $state('');
	let busy = $state(false);
	let error = $state('');
	let lastAccount = '';

	const methods = $derived(($twofaRequest?.methods || []).map((m) => String(m).toLowerCase()));

	// reset for each new account that asks, but not when the same one asks again
	$effect(() => {
		const id = $twofaRequest?.accountId || '';
		if (id === lastAccount) return;
		lastAccount = id;
		code = error = '';
		busy = false;
		method = methods[0] || 'totp';
	});

	const close = () => twofaRequest.set(null);

	async function submit() {
		const twoFactorCode = code.trim().replace(/\s+/g, '');
		if (!twoFactorCode) {
			error = 'Enter the verification code';
			return;
		}
		error = '';
		busy = true;
		try {
			const r = await loginAccount($twofaRequest.accountId, { twoFactorCode, twoFactorMethod: method });
			if (r.ok) {
				toasts.success('Logged in');
				close();
			} else {
				error = r.requires2fa ? 'Wrong code, try again' : r.error || 'Verification failed';
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if $twofaRequest}
	<Modal title="Two-factor authentication" size="sm" onclose={close}>
		<form id="twofa" class="stack" onsubmit={(e) => (e.preventDefault(), submit())}>
			<p class="muted small">"{accountName($twofaRequest.accountId)}" has 2FA enabled. Enter a code to finish logging in.</p>
			{#if methods.length > 1}
				<label class="field">
					<span class="lbl">Method</span>
					<select bind:value={method}>
						{#each methods as m (m)}<option value={m}>{LABELS[m]?.[0] || m}</option>{/each}
					</select>
				</label>
			{/if}
			<label class="field">
				<span class="lbl">Code <span class="faint">{LABELS[method]?.[1] || ''}</span></span>
				<input bind:value={code} autocomplete="one-time-code" inputmode="numeric" data-autofocus oninput={() => (error = '')} />
			</label>
			{#if error}<div class="error-text small">{error}</div>{/if}
		</form>
		{#snippet footer()}
			<button class="btn ghost" onclick={close} disabled={busy}>Cancel</button>
			<button class="btn primary" type="submit" form="twofa" disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>
		{/snippet}
	</Modal>
{/if}
