<script>
	import { addAccount } from '$lib/stores/accounts.js';
	import { toasts } from '$lib/stores/toast.js';
	import { loginAccount } from '$lib/stores/accounts.js';

	/** @type {{ open: boolean, onClose: () => void }} */
	let { open = $bindable(), onClose } = $props();

	let username = $state('');
	let password = $state('');
	let displayName = $state('');
	let saving = $state(false);
	let error = $state('');

	async function submit() {
		if (!username.trim() || !password) {
			error = '用户名和密码必填';
			return;
		}
		error = '';
		saving = true;
		try {
			const acc = await addAccount(username.trim(), password, displayName.trim() || username.trim());
			// immediately try to log in
			const r = await loginAccount(acc.id, { username, password });
			if (r.requires2fa) {
				toasts.push('请输入 2FA 验证码', 'info');
				// bubble up by setting a window event so parent can show LoginDialog with 2FA
				window.dispatchEvent(
					new CustomEvent('vrc-2fa-required', { detail: { accountId: acc.id, methods: r.requires2fa } })
				);
			}
			close();
		} catch (err) {
			error = err.message || '保存失败';
		} finally {
			saving = false;
		}
	}

	function close() {
		username = '';
		password = '';
		displayName = '';
		error = '';
		onClose?.();
	}
</script>

{#if open}
	<div
		class="modal-backdrop"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
		role="presentation"
	>
		<div class="modal" role="dialog" aria-modal="true">
			<h2>添加 VRChat 账号</h2>
			<p class="muted" style="margin-top: -8px; font-size: 12px;">
				账号凭据会用本地密钥加密后保存。你可以随时删除账号。
			</p>
			<div class="form-row">
				<label for="u">用户名或邮箱</label>
				<input id="u" type="text" bind:value={username} autocomplete="username" />
			</div>
			<div class="form-row">
				<label for="p">密码</label>
				<input id="p" type="password" bind:value={password} autocomplete="current-password" />
			</div>
			<div class="form-row">
				<label for="d">显示名 (可选)</label>
				<input id="d" type="text" bind:value={displayName} />
			</div>
			{#if error}
				<div class="error">{error}</div>
			{/if}
			<div class="actions">
				<button class="ghost" onclick={close} disabled={saving}>取消</button>
				<button class="primary" onclick={submit} disabled={saving}>{saving ? '保存中…' : '保存并登录'}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.error {
		background: rgba(255, 93, 108, 0.12);
		border: 1px solid rgba(255, 93, 108, 0.3);
		color: var(--danger);
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
		margin-top: 6px;
	}
</style>
