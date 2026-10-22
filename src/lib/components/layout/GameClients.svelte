<script>
	import { onMount } from 'svelte';
	import Icon from '../ui/Icon.svelte';
	import { accounts, accountLabel } from '$lib/stores/accounts.js';
	import { settings } from '$lib/stores/settings.js';
	import { toasts } from '$lib/stores/toast.js';
	import { gameClients, refreshGameClients, closeGameClient } from '$lib/stores/gameClients.js';

	let closing = $state('');
	let now = $state(Date.now());

	onMount(() => {
		refreshGameClients();
		// looked at every few seconds while the tab is visible; actions refresh it at once
		const t = setInterval(() => {
			now = Date.now();
			if (!document.hidden) refreshGameClients();
		}, 8000);
		return () => clearInterval(t);
	});

	const accountOf = (map, profile) => {
		const uid = map[String(profile)];
		const a = uid ? $accounts.find((x) => x.currentUser?.id === uid) : null;
		return a ? accountLabel(a) : '';
	};
	const rows = $derived(
		['main', 'aux'].map((kind) => {
			const c = $gameClients.clients.find((x) => x.kind === kind);
			const map = kind === 'aux' ? $gameClients.auxProfiles : $gameClients.profiles;
			return {
				kind,
				title: kind === 'main' ? 'Main game' : 'Helper',
				hint: kind === 'main' ? 'Your own game: started by Play as' : 'Temporary logins and relays: closed as soon as its task is done',
				running: !!c,
				profile: c?.profile,
				account: c ? accountOf(map, c.profile) : '',
				busy: kind === 'aux' ? $gameClients.busyAux : $gameClients.busyMain
			};
		})
	);
	// the helper left open at a login screen: how long until it is closed
	const loginLeft = $derived($gameClients.loginUntil > now ? Math.ceil(($gameClients.loginUntil - now) / 60000) : 0);

	async function close(kind) {
		closing = kind;
		try {
			await closeGameClient(kind);
			toasts.success(kind === 'aux' ? 'Helper client closed' : 'Main game closed');
		} catch (err) {
			toasts.error(err.message);
		}
		closing = '';
	}
</script>

<div class="gc">
	<div class="head">
		<span class="h">Game clients</span>
		<span class="spacer"></span>
		<button class="btn ghost icon sm" title="Refresh" onclick={refreshGameClients}><Icon name="refresh" /></button>
	</div>
	{#if !$gameClients.ok && $gameClients.error}
		<p class="faint small err" title={$gameClients.error}><Icon name="alert" /> Game machine not reachable</p>
	{:else}
		{#each rows as r (r.kind)}
			<div class="row" title={r.hint}>
				<span class="dot" class:on={r.running} class:busy={r.busy}></span>
				<span class="who">
					<strong>{r.title}</strong>
					<span class="faint small ellipsis">
						{#if r.running}{r.account || 'Unknown account'} · profile {r.profile}{#if r.busy} · working…{/if}{:else}{r.busy ? 'starting…' : 'not running'}{/if}
					</span>
				</span>
				{#if r.running || r.busy}
					<button class="btn ghost xs" disabled={closing === r.kind} title="Close this client now" onclick={() => close(r.kind)}>{closing === r.kind ? 'Closing…' : 'Close'}</button>
				{/if}
			</div>
		{/each}
		{#if loginLeft && rows[1].running}
			<p class="faint small login">
				The helper waits for a login
				<a href={$settings['game.auxDisplayUrl']} target="_blank" rel="noreferrer">on its display</a>
				· closes in {loginLeft} min
			</p>
		{/if}
	{/if}
</div>

<style>
	.gc {
		flex: none;
		margin: 6px 8px 10px;
		padding: 8px 8px 6px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-2, transparent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 2px 4px 6px;
	}
	.h {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 4px 4px 6px;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--offline, #666);
	}
	.dot.on {
		background: var(--online);
	}
	.dot.busy {
		background: var(--warn);
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		font-size: 12px;
	}
	.err,
	.login {
		margin: 2px 6px 4px;
		line-height: 1.4;
	}
	.login a {
		color: var(--accent-ink, var(--accent));
	}
</style>
