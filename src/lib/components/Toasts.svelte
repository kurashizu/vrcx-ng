<script>
	import { toasts } from '$lib/stores/toast.js';
</script>

<div class="toast-stack">
	{#each $toasts as t (t.id)}
		<div class="toast {t.kind}">{t.message}</div>
	{/each}
</div>
