<script>
	import { toasts } from '$lib/stores/toast.js';

	/** @type {{ open: boolean, accountId: string, user: any, onSaved?: () => void }} */
	let {
		open = $bindable(false),
		accountId = '',
		user = null,
		onSaved = undefined
	} = $props();

	const STATUS_OPTIONS = [
		{ value: 'active', label: '🟢 在线', cls: 'on' },
		{ value: 'join me', label: '🔵 加入我', cls: 'on' },
		{ value: 'ask me', label: '🟡 询问我', cls: 'on' },
		{ value: 'busy', label: '🔴 忙碌', cls: 'on' },
		{ value: 'offline', label: '⚫ 离线', cls: 'on' }
	];

	let status = $state('active');
	let statusDescription = $state('');
	let bio = $state('');
	let bioLinks = $state([]);
	let pronouns = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open && user) {
			status = user.status || 'active';
			statusDescription = user.statusDescription || '';
			bio = user.bio || '';
			bioLinks = (user.bioLinks || []).map((l) => l).slice(0, 3);
			pronouns = user.pronouns || '';
		}
	});

	async function save() {
		if (!accountId) return;
		busy = true;
		try {
			const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/profile`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status,
					statusDescription,
					bio,
					bioLinks: bioLinks.filter((l) => String(l || '').trim()),
					pronouns
				})
			});
			const j = await r.json().catch(() => ({}));
			if (j.ok) {
				toasts.success('资料已保存');
				open = false;
				onSaved?.();
			} else {
				toasts.error(j.error || '保存失败');
			}
		} catch (err) {
			toasts.error('保存失败: ' + err.message);
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<div class="backdrop" onclick={() => (open = false)}></div>
	<div class="panel" role="dialog" aria-label="编辑个人资料">
		<header>
			<span class="title">✏️ 编辑个人资料</span>
			<button class="ghost xs" onclick={() => (open = false)} aria-label="关闭">✕</button>
		</header>

		<div class="body">
			<label class="field">
				<span class="lbl">状态</span>
				<select bind:value={status} class="ipt">
					{#each STATUS_OPTIONS as o (o.value)}
						<option value={o.value}>{o.label}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span class="lbl">状态描述（≤32）</span>
				<input type="text" bind:value={statusDescription} maxlength="32" class="ipt" placeholder="例如：在 VR 里摸鱼…" />
			</label>

			<label class="field">
				<span class="lbl">Bio（≤512）</span>
				<textarea bind:value={bio} maxlength="512" rows="4" class="ipt" placeholder="介绍一下自己…"></textarea>
			</label>

			<div class="field">
				<span class="lbl">Bio 链接（≤3）</span>
				<div class="links">
					{#each [0, 1, 2] as i (i)}
						{#if bioLinks[i] !== undefined}
							<div class="link-row">
								<input type="url" bind:value={bioLinks[i]} class="ipt" placeholder="https://…" />
								<button class="ghost xs" onclick={() => (bioLinks[i] = '')} title="移除">✕</button>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<label class="field">
				<span class="lbl">代词（≤32）</span>
				<input type="text" bind:value={pronouns} maxlength="32" class="ipt" placeholder="例如：she/her" />
			</label>
		</div>

		<footer>
			<button class="ghost" onclick={() => (open = false)}>取消</button>
			<button class="primary" disabled={busy} onclick={save}>{busy ? '保存中…' : '保存'}</button>
		</footer>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 310;
	}
	.panel {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(460px, 92vw);
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: 14px;
		z-index: 320;
		overflow: hidden;
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
	}
	.title {
		font-weight: 700;
		font-size: 14px;
	}
	.body {
		padding: 14px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.lbl {
		font-size: 12px;
		color: var(--text-dim);
	}
	.ipt {
		width: 100%;
		box-sizing: border-box;
	}
	textarea.ipt {
		resize: vertical;
	}
	.links {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.link-row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.link-row .ipt {
		flex: 1;
	}
	footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 14px;
		border-top: 1px solid var(--border);
	}
</style>