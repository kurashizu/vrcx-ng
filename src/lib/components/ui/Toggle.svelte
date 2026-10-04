<script>
	/** @type {{ checked?: boolean, onchange?: (v: boolean) => void, disabled?: boolean, label?: string }} */
	let { checked = false, onchange, disabled = false, label = '' } = $props();
</script>

<label class="toggle" class:disabled>
	<input type="checkbox" {checked} {disabled} aria-label={label || undefined} onchange={(e) => onchange?.(e.currentTarget.checked)} />
	<span class="track"></span>
</label>

<style>
	.toggle {
		position: relative;
		flex: none;
		display: inline-block;
		width: 36px;
		height: 20px;
	}
	input {
		position: absolute;
		inset: 0;
		opacity: 0;
		margin: 0;
		cursor: pointer;
	}
	.track {
		position: absolute;
		inset: 0;
		border-radius: 20px;
		background: var(--bg-3);
		border: 1px solid var(--border-strong);
		transition: background 0.15s, border-color 0.15s;
		pointer-events: none;
	}
	.track::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--text-dim);
		transition: transform 0.15s, background 0.15s;
	}
	input:checked + .track {
		background: var(--accent-strong);
		border-color: transparent;
	}
	input:checked + .track::after {
		transform: translateX(16px);
		background: #fff;
	}
	input:focus-visible + .track {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.disabled {
		opacity: 0.5;
	}
	.disabled input {
		cursor: not-allowed;
	}
</style>
