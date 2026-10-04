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
			error = '用户名和密码必填';
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
			error = err.message || '保存失败';
		} finally {
			busy = false;
		}
	}
</script>

{#if $addAccountOpen}
	<Modal title="添加 VRChat 账号" size="sm" onclose={close}>
		<form id="add-account" class="stack" onsubmit={(e) => (e.preventDefault(), submit())}>
			<p class="muted small">账号凭据会加密后保存在这台机器上，随时可以删除。</p>
			<label class="field">
				<span class="lbl">用户名或邮箱</span>
				<input bind:value={username} autocomplete="username" data-autofocus />
			</label>
			<label class="field">
				<span class="lbl">密码</span>
				<input type="password" bind:value={password} autocomplete="current-password" />
			</label>
			<label class="field">
				<span class="lbl">显示名（可选）</span>
				<input bind:value={displayName} />
			</label>
			{#if error}<div class="error-text small">{error}</div>{/if}
		</form>
		{#snippet footer()}
			<button class="btn ghost" onclick={close} disabled={busy}>取消</button>
			<button class="btn primary" type="submit" form="add-account" disabled={busy}>{busy ? '登录中…' : '保存并登录'}</button>
		{/snippet}
	</Modal>
{/if}
