<script>
	import Modal from './Modal.svelte';
	import { confirmRequest, answerConfirm } from '$lib/stores/overlay.js';
</script>

{#if $confirmRequest}
	<Modal size="sm" onclose={() => answerConfirm(false)}>
		<p class="msg">{$confirmRequest.message}</p>
		{#snippet footer()}
			<button class="btn ghost" onclick={() => answerConfirm(false)}>取消</button>
			<button class="btn" class:danger={$confirmRequest.danger} class:primary={!$confirmRequest.danger} onclick={() => answerConfirm(true)}>
				{$confirmRequest.okLabel}
			</button>
		{/snippet}
	</Modal>
{/if}

<style>
	.msg {
		padding: 8px 20px 8px 0;
		line-height: 1.6;
	}
</style>
