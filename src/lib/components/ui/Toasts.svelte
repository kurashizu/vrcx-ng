<script>
	import { toasts } from '$lib/stores/toast.js';
</script>

<div class="stack" aria-live="polite">
	{#each $toasts as t (t.id)}
		<div class="toast {t.kind}">
			<span class="ico">{t.kind === 'success' ? '✓' : t.kind === 'error' ? '⚠' : 'ℹ'}</span>
			{t.message}
		</div>
	{/each}
</div>

<style>
	.stack {
		position: fixed;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: var(--z-toast);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		pointer-events: none;
	}
	.toast {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		max-width: min(440px, 92vw);
		padding: 9px 14px;
		background: var(--bg-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-lg);
		animation: pop 0.18s;
		overflow-wrap: anywhere;
	}
	.ico {
		flex: none;
		font-weight: 700;
		color: var(--text-dim);
	}
	.success .ico {
		color: var(--success);
	}
	.error {
		border-color: color-mix(in srgb, var(--danger) 60%, transparent);
	}
	.error .ico {
		color: var(--danger);
	}
</style>
