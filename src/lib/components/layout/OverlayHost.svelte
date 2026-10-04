<script>
	import { overlays } from '$lib/stores/overlay.js';
	import UserDialog from '../dialogs/UserDialog.svelte';
	import WorldDialog from '../dialogs/WorldDialog.svelte';
	import AvatarDialog from '../dialogs/AvatarDialog.svelte';
</script>

<!-- the stack of user / world / avatar detail dialogs; later entries sit on top -->
{#each $overlays as o (o.id)}
	{#if o.kind === 'user'}
		<UserDialog request={o} />
	{:else if o.kind === 'world'}
		<WorldDialog request={o} />
	{:else if o.kind === 'avatar'}
		<AvatarDialog request={o} />
	{/if}
{/each}
