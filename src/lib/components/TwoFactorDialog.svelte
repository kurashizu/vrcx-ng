<script>
	import { loginAccount } from '$lib/stores/accounts.js';
	import { toasts } from '$lib/stores/toast.js';

	/**
	 * @type {{ open: boolean, accountId: string, methods: string[], onClose: () => void, onSuccess?: () => void }}
	 */
	let { open = $bindable(), accountId, methods, onClose, onSuccess } = $props();

	/** @type {string} */
	let method = $state('totp');
	let code = $state('');
	let submitting = $state(false);
	let error = $state('');

	// Normalize methods to lowercase for display + matching
	const methodList = $derived((methods || []).map((m) => String(m).toLowerCase()));

	// Reset state whenever the dialog is opened (or re-opened for a different account).
	$effect(() => {
		// Re-initialize whenever `open` flips to true or the account changes.
		void open;
		void accountId;
		code = '';
		error = '';
		submitting = false;
		const list = (methods || []).map((m) => String(m).toLowerCase());
		method = list[0] || 'totp';
	});

	const methodLabel = $derived.by(() => {
		if (method === 'totp') return 'TOTP 验证器 (如 Google Authenticator、Authy)';
		if (method === 'emailotp') return '邮件验证码 — VRChat 会发一封 6 位邮件给你';
		if (method === 'otp') return '一次性恢复码 — 8 位';
		return method;
	});

	const hasTotp = $derived(methodList.includes('totp'));
	const hasEmail = $derived(methodList.includes('emailotp'));
	const hasOtp = $derived(methodList.includes('otp'));

	async function submit() {
		const cleanCode = String(code || '').trim().replace(/\s+/g, '');
		if (!cleanCode) {
			error = '请输入验证码';
			return;
		}
		error = '';
		submitting = true;
		try {
			const r = await loginAccount(accountId, {
				twoFactorCode: cleanCode,
				twoFactorMethod: method
			});
			if (!r.ok) {
				error = r.error || '验证失败';
				return;
			}
			toasts.success('登录成功');
			code = '';
			onSuccess?.();
			onClose?.();
		} catch (err) {
			error = err?.message || '验证失败';
		} finally {
			submitting = false;
		}
	}

	function onKeydown(e) {
		if (e.key === 'Enter' && !submitting) {
			e.preventDefault();
			submit();
		}
	}

	function onCodeInput() {
		// clear stale error as soon as the user edits
		if (error) error = '';
	}
</script>

{#if open}
	<div
		class="modal-backdrop"
		onclick={(e) => {
			if (e.target === e.currentTarget) onClose?.();
		}}
		role="presentation"
	>
		<div class="modal" role="dialog" aria-modal="true" onkeydown={onKeydown}>
			<h2>两步验证</h2>
			<p class="muted hint">检测到账号开启了 2FA，请输入验证码完成登录。</p>

			<div class="form-row">
				<label for="m">验证方式</label>
				<select id="m" bind:value={method}>
					{#if hasTotp}
						<option value="totp">TOTP 验证器</option>
					{/if}
					{#if hasEmail}
						<option value="emailotp">邮件验证码</option>
					{/if}
					{#if hasOtp}
						<option value="otp">一次性恢复码</option>
					{/if}
				</select>
				<div class="muted" style="font-size: 12px; margin-top: 4px;">{methodLabel}</div>
			</div>

			<div class="form-row">
				<label for="c">验证码</label>
				<input
					id="c"
					type="text"
					bind:value={code}
					oninput={onCodeInput}
					autocomplete="one-time-code"
					inputmode="numeric"
					autofocus
					placeholder={method === 'otp' ? 'abcdef12 (8 位恢复码)' : '123456'}
				/>
			</div>

			{#if error}
				<div class="error">{error}</div>
			{/if}

			<div class="actions">
				<button class="ghost" onclick={() => onClose?.()} disabled={submitting}>取消</button>
				<button class="primary" onclick={submit} disabled={submitting}>
					{submitting ? '验证中…' : '验证'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.hint {
		font-size: 13px;
		margin: 0 0 12px;
	}
	.error {
		background: rgba(255, 93, 108, 0.12);
		border: 1px solid rgba(255, 93, 108, 0.3);
		color: var(--danger);
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
		margin-top: 6px;
	}
	.modal :global(input),
	.modal :global(select) {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.05em;
	}
</style>
