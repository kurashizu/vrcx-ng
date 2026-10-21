<script>
	import Avatar from '../ui/Avatar.svelte';
	import UserName from '../ui/UserName.svelte';
	import { openUser } from '$lib/stores/overlay.js';
	import { openFriendMenu } from '$lib/client/friendMenu.js';

	/** A friend as a small pill inside an instance bubble. @type {{ friend: import('$lib/stores/friends.js').Friend }} */
	let { friend: f } = $props();

	const accountId = $derived(f.accountIds?.[0] || '');
</script>

<button
	class="chip"
	title={f.statusDescription || f.status || ''}
	onclick={() => openUser(f.id, { accountId, name: f.displayName })}
	oncontextmenu={(e) => openFriendMenu(e, f)}
>
	<Avatar src={f.currentAvatarThumbnailImageUrl} name={f.displayName} size={28} {accountId} presence={f.state} status={f.status} />
	<span class="n ellipsis"><UserName user={f} /></span>
	{#if f.status === 'join me'}<span class="jm">Join Me</span>{/if}
</button>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		max-width: 100%;
		padding: 3px 11px 3px 3px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		border-radius: 999px;
		cursor: pointer;
		transition: border-color 0.12s, background 0.12s;
	}
	.chip:hover,
	.chip:focus-visible {
		border-color: var(--border-strong);
		background: var(--bg-2);
	}
	.n {
		min-width: 0;
		font-size: 13px;
	}
	.jm {
		flex: none;
		font-size: 10.5px;
		font-weight: 650;
		padding: 0 6px;
		border-radius: 999px;
		color: #38bdf8;
		background: rgba(56, 189, 248, 0.14);
	}
</style>
