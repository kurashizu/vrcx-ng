<script>
	import Avatar from '../ui/Avatar.svelte';
	import UserName from '../ui/UserName.svelte';
	import { openUser } from '$lib/stores/overlay.js';
	import { openFriendMenu } from '$lib/client/friendMenu.js';
	import { accountName, loggedInAccounts } from '$lib/stores/accounts.js';

	/** A friend as a small pill inside an instance bubble. @type {{ friend: import('$lib/stores/friends.js').Friend }} */
	let { friend: f } = $props();

	const accountId = $derived(f.accountIds?.[0] || '');

	/** which of our accounts this person is a friend of (only worth showing with more than one account) */
	const via = $derived($loggedInAccounts.length > 1 ? (f.accountIds || []).map((id) => ({ id, name: accountName(id) })) : []);
	const hue = (id) => {
		let h = 0;
		for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
		return h;
	};
</script>

<button
	class="chip"
	title={[f.statusDescription || f.status || '', via.length ? `Friend of: ${via.map((v) => v.name).join(', ')}` : ''].filter(Boolean).join('\n')}
	onclick={() => openUser(f.id, { accountId, name: f.displayName })}
	oncontextmenu={(e) => openFriendMenu(e, f)}
>
	<Avatar src={f.currentAvatarThumbnailImageUrl} name={f.displayName} size={28} {accountId} presence={f.state} status={f.status} />
	<span class="txt">
		<span class="n ellipsis"><UserName user={f} /></span>
		{#if via.length}
			<span class="via">
				{#each via as v (v.id)}<span class="a ellipsis" style="--h: {hue(v.id)}">{v.name}</span>{/each}
			</span>
		{/if}
	</span>
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
		border-radius: 18px;
		cursor: pointer;
		transition: border-color 0.12s, background 0.12s;
	}
	.chip:hover,
	.chip:focus-visible {
		border-color: var(--border-strong);
		background: var(--bg-2);
	}
	.txt {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		line-height: 1.2;
	}
	.n {
		max-width: 100%;
		font-size: 13px;
	}
	.via {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 4px;
		max-width: 100%;
		margin-top: 1px;
	}
	.a {
		max-width: 90px;
		padding: 0 5px;
		font-size: 9.5px;
		font-weight: 600;
		border-radius: 999px;
		color: hsl(var(--h) 75% 78%);
		background: hsl(var(--h) 60% 50% / 0.16);
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
