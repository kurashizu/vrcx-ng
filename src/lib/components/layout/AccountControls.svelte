<script>
	import Icon from '../ui/Icon.svelte';
	import { loginAccount, logoutAccount, reconnectAccount, removeAccount, accountLabel } from '$lib/stores/accounts.js';
	import { openUser, askConfirm } from '$lib/stores/overlay.js';

	/**
	 * The actions available for an account. `compact` = icon-only (sidebar),
	 * otherwise labelled buttons (settings).
	 * @type {{ account: import('$lib/stores/accounts.js').AccountView, compact?: boolean }}
	 */
	let { account: a, compact = false } = $props();

	let busy = $state(false);

	async function login() {
		busy = true;
		await loginAccount(a.id);
		busy = false;
	}

	async function remove() {
		const ok = await askConfirm(`Remove account "${accountLabel(a)}"? The stored password is deleted too.`, { okLabel: 'Remove', danger: true });
		if (ok) removeAccount(a.id);
	}
</script>

{#snippet control(icon, label, onclick, danger = false, disabled = false)}
	<button
		class="btn {compact ? 'ghost icon sm' : 'xs'}"
		class:danger
		title={label}
		aria-label={label}
		disabled={disabled || busy}
		onclick={(e) => (e.stopPropagation(), onclick())}
	>
		<Icon name={icon} />{#if !compact}&nbsp;{label}{/if}
	</button>
{/snippet}

<span class="controls">
	{#if a.loggedIn && a.currentUser?.id}
		{@render control('user', 'Profile', () => openUser(a.currentUser.id, { accountId: a.id, name: accountLabel(a) }))}
	{/if}
	{#if a.loggedIn && !a.connected}
		{@render control('refresh', 'Reconnect', () => reconnectAccount(a.id))}
	{/if}
	{#if a.loggedIn}
		{@render control('log-out', 'Log out', () => logoutAccount(a.id))}
	{:else}
		{@render control('log-in', 'Log in', login)}
	{/if}
	{#if !a.loggedIn || !compact}
		{@render control('x', 'Remove', remove, true)}
	{/if}
</span>

<style>
	.controls {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}
</style>
