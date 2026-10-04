<script>
	import { twofaRequest, loginAccount, accountName } from '$lib/stores/accounts.js';
	import { toasts } from '$lib/stores/toast.js';
	import Modal from '../ui/Modal.svelte';

	const LABELS = {
		totp: ['验证器 App', 'Google Authenticator、Authy 等生成的 6 位码'],
		emailotp: ['邮件验证码', 'VRChat 会给账号邮箱发一封含 6 位码的邮件'],
		otp: ['恢复码', '一次性的 8 位恢复码']
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
			error = '请输入验证码';
			return;
		}
		error = '';
		busy = true;
		try {
			const r = await loginAccount($twofaRequest.accountId, { twoFactorCode, twoFactorMethod: method });
			if (r.ok) {
				toasts.success('登录成功');
				close();
			} else {
				error = r.requires2fa ? '验证码不对，请重试' : r.error || '验证失败';
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if $twofaRequest}
	<Modal title="两步验证" size="sm" onclose={close}>
		<form id="twofa" class="stack" onsubmit={(e) => (e.preventDefault(), submit())}>
			<p class="muted small">「{accountName($twofaRequest.accountId)}」开启了 2FA，输入验证码完成登录。</p>
			{#if methods.length > 1}
				<label class="field">
					<span class="lbl">验证方式</span>
					<select bind:value={method}>
						{#each methods as m (m)}<option value={m}>{LABELS[m]?.[0] || m}</option>{/each}
					</select>
				</label>
			{/if}
			<label class="field">
				<span class="lbl">验证码 <span class="faint">{LABELS[method]?.[1] || ''}</span></span>
				<input bind:value={code} autocomplete="one-time-code" inputmode="numeric" data-autofocus oninput={() => (error = '')} />
			</label>
			{#if error}<div class="error-text small">{error}</div>{/if}
		</form>
		{#snippet footer()}
			<button class="btn ghost" onclick={close} disabled={busy}>取消</button>
			<button class="btn primary" type="submit" form="twofa" disabled={busy}>{busy ? '验证中…' : '验证'}</button>
		{/snippet}
	</Modal>
{/if}
