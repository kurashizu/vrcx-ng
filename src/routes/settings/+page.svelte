<script>
	import Icon from '$lib/components/ui/Icon.svelte';
	import { settings, settingsLoaded, updateSetting, saveSettings, resetSettings } from '$lib/stores/settings.js';
	import { accounts, accountLabel, refreshAccounts } from '$lib/stores/accounts.js';
	import { addAccountOpen, askConfirm } from '$lib/stores/overlay.js';
	import { toasts } from '$lib/stores/toast.js';
	import { run } from '$lib/client/api.js';
	import { FEED_META } from '$lib/shared/feed.js';
	import { formatDateTime } from '$lib/shared/format.js';
	import Page from '$lib/components/ui/Page.svelte';
	import Notice from '$lib/components/ui/Notice.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import SettingRow from '$lib/components/ui/SettingRow.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import AccountControls from '$lib/components/layout/AccountControls.svelte';

	/**
	 * Every ordinary setting is declared here; the page renders them generically.
	 * kind: toggle | select | number | text
	 */
	const SECTIONS = [
		{ id: 'accounts', icon: 'user', label: 'Accounts' },
		{
			id: 'general',
			icon: 'sliders',
			label: 'General',
			rows: [
				{ key: 'ui.theme', kind: 'select', label: 'Theme', desc: 'Dark, light, or follow the system', options: [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']] },
				{ key: 'ui.trustColors', kind: 'toggle', label: 'Trust rank colors', desc: 'Color user names by VRChat trust rank' },
				{ key: 'ui.showInstanceId', kind: 'toggle', label: 'Show instance ID', desc: 'Show a short instance identifier next to the world' },
				{ key: 'ui.hideSelfInFeed', kind: 'toggle', label: 'Hide yourself in the feed', desc: 'Do not show events caused by your own accounts' }
			]
		},
		{
			id: 'feed',
			icon: 'radio',
			label: 'Feed',
			rows: [
				{ key: 'feed.maxEntries', kind: 'number', min: 100, max: 5000, step: 100, label: 'Entries kept on the page', desc: 'How many feed entries the browser keeps' },
				{ key: 'feed.retentionDays', kind: 'number', min: 0, max: 365, step: 1, label: 'History retention (days)', desc: 'How long the database keeps feed entries; 0 = never clean up' }
			],
			feedTypes: true
		},
		{
			id: 'notification',
			icon: 'bell',
			label: 'Notifications',
			rows: [
				{ key: 'notification.desktop', kind: 'desktop', label: 'Desktop notifications', desc: 'Show system notifications while the page is in the background (the browser needs https or localhost)' },
				{ key: 'notification.friendOnline', kind: 'toggle', label: 'Friend online', desc: 'Notify when a friend goes from offline to online' },
				{ key: 'notification.invite', kind: 'toggle', label: 'Invites', desc: 'Notify when an instance invite arrives' },
				{ key: 'notification.friendRequest', kind: 'toggle', label: 'Friend requests', desc: 'Notify when a friend request arrives' }
			]
		},
		{
			id: 'chatbox',
			icon: 'message',
			label: 'Chatbox',
			intro: 'The chatbox is sent over OSC (UDP) to the machine running VRChat: enter its IP; use 127.0.0.1 for this machine.',
			rows: [
				{ key: 'chatbox.host', kind: 'text', placeholder: '127.0.0.1', label: 'Target address', desc: 'IP or hostname of the machine running the VRChat client' },
				{ key: 'chatbox.port', kind: 'number', min: 1, max: 65535, step: 1, label: 'Target port', desc: 'The default VRChat OSC port is 9000' },
				{ key: 'chatbox.keepHistory', kind: 'toggle', label: 'Keep history', desc: 'Remember recently sent messages in the browser' },
				{ key: 'chatbox.historyMax', kind: 'number', min: 0, max: 100, step: 1, label: 'History size', desc: 'Maximum number of messages kept' }
			]
		},
		{
			id: 'friend',
			icon: 'users',
			label: 'Friend list',
			rows: [
				{ key: 'friend.showLastSeen', kind: 'toggle', label: 'Show last seen', desc: 'Show how long ago offline friends were last online' },
				{ key: 'friend.sortOfflineBy', kind: 'select', label: 'Offline friend order', desc: 'Order of offline friends in the side list and the overview', options: [['lastSeen', 'Most recently seen first'], ['name', 'By name']] }
			]
		},
		{ id: 'advanced', icon: 'wrench', label: 'Advanced' }
	];

	let section = $state('general');
	const current = $derived(SECTIONS.find((s) => s.id === section));

	const set = (key, value) => updateSetting(key, value);

	function commitNumber(row, e) {
		const n = Number(e.currentTarget.value);
		if (!Number.isFinite(n)) return;
		const v = Math.min(row.max, Math.max(row.min, Math.round(n)));
		e.currentTarget.value = String(v);
		set(row.key, v);
	}

	// ---- desktop notifications need a one-off browser permission ----
	async function toggleDesktop(on) {
		if (!on) return set('notification.desktop', false);
		if (typeof Notification === 'undefined') return toasts.error('This browser context does not support desktop notifications (needs https or localhost)');
		const permission = await Notification.requestPermission();
		if (permission === 'granted') {
			set('notification.desktop', true);
			toasts.success('Desktop notifications enabled');
		} else {
			set('notification.desktop', false);
			toasts.error('Notification permission was not granted');
		}
	}

	// ---- which event types the feed shows by default ----
	const typeEnabled = (t) => ($settings['feed.types'] || {})[t] !== false;
	function toggleType(t) {
		set('feed.types', { ...($settings['feed.types'] || {}), [t]: !typeEnabled(t) });
	}

	// ---- backup ----
	function exportAll() {
		const blob = new Blob([JSON.stringify($settings, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'vrcx-ng-settings.json';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async function importFile(e) {
		const input = e.currentTarget;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const updates = JSON.parse(await file.text());
			if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new Error('Not a settings file');
			await saveSettings(updates);
			toasts.success('Settings imported');
		} catch (err) {
			toasts.error(`Import failed: ${err.message}`);
		}
	}

	async function resetAll() {
		if (!(await askConfirm('Reset all settings to their defaults?', { okLabel: 'Reset', danger: true }))) return;
		await run(() => resetSettings(), 'All settings reset');
	}
</script>

{#snippet field(r)}
	{@const v = $settings[r.key]}
	<SettingRow label={r.label} desc={r.desc}>
		{#if r.kind === 'toggle'}
			<Toggle checked={!!v} label={r.label} onchange={(x) => set(r.key, x)} />
		{:else if r.kind === 'desktop'}
			<Toggle checked={!!v} label={r.label} onchange={toggleDesktop} />
		{:else if r.kind === 'select'}
			<select value={v} onchange={(e) => set(r.key, e.currentTarget.value)}>
				{#each r.options as [val, label] (val)}<option value={val}>{label}</option>{/each}
			</select>
		{:else if r.kind === 'number'}
			<input type="number" min={r.min} max={r.max} step={r.step} value={v} onchange={(e) => commitNumber(r, e)} />
		{:else}
			<input type="text" placeholder={r.placeholder} value={v ?? ''} onchange={(e) => set(r.key, e.currentTarget.value.trim())} />
		{/if}
	</SettingRow>
{/snippet}

<Page title="Settings" icon="sliders" width="wide">
	{#if !$settingsLoaded}
		<Notice kind="loading" />
	{:else}
		<div class="layout">
			<nav>
				{#each SECTIONS as s (s.id)}
					<button class:on={section === s.id} onclick={() => (section = s.id)}><span class="ico"><Icon name={s.icon} /></span>{s.label}</button>
				{/each}
			</nav>

			<div class="card panel">
				<h2>{current.label}</h2>

				{#if section === 'accounts'}
					<div class="row bar">
						<button class="btn primary sm" onclick={() => addAccountOpen.set(true)}><Icon name="plus" /> Add account</button>
						<button class="btn ghost sm" onclick={() => refreshAccounts()}><Icon name="refresh" /> Refresh</button>
					</div>
					{#if !$accounts.length}
						<Notice icon="key" text="No accounts yet; click Add account to log in to your VRChat account" />
					{/if}
					{#each $accounts as a (a.id)}
						<div class="acct">
							<Avatar src={a.currentUser?.currentAvatarThumbnailImageUrl} name={accountLabel(a)} size={42} accountId={a.id} dot={a.connected ? 'var(--online)' : a.loggedIn ? 'var(--warn)' : 'var(--offline)'} />
							<div class="who">
								<div class="n">{accountLabel(a)}</div>
								<div class="faint small ellipsis">{a.username}{a.currentUser?.id ? ` · ${a.currentUser.id}` : ''}</div>
								<div class="meta">
									{#if a.connected}<span class="badge ok">Connected</span>
									{:else if a.loggedIn}<span class="badge warn">Logged in · not connected</span>
									{:else}<span class="badge">Not logged in</span>{/if}
									{#if a.lastLoginAt}<span class="faint small">Logged in {formatDateTime(a.lastLoginAt)}</span>{/if}
									{#if a.lastError}<span class="error-text small"><Icon name="alert" /> {a.lastError}</span>{/if}
								</div>
							</div>
							<AccountControls account={a} />
						</div>
					{/each}
				{:else if section === 'advanced'}
					<SettingRow label="Export settings" desc="Download all settings as a JSON file">
						<button class="btn" onclick={exportAll}>Export</button>
					</SettingRow>
					<SettingRow label="Import settings" desc="Restore from a JSON file (overwrites settings with the same name)">
						<label class="btn">Choose file<input type="file" accept="application/json" hidden onchange={importFile} /></label>
					</SettingRow>
					<SettingRow label="Reset all settings" desc="Restore the defaults; accounts and feed history are not affected">
						<button class="btn danger" onclick={resetAll}>Reset</button>
					</SettingRow>
					<div class="debug muted small">
						<div>Database: <code>data/vrcx-ng.db</code></div>
						<div>Service: <code>systemctl --user status vrcx-ng</code></div>
						<div>Logs: <code>journalctl --user -u vrcx-ng -f</code></div>
					</div>
				{:else}
					{#if current.intro}<p class="muted small intro">{current.intro}</p>{/if}
					{#each current.rows as r (r.key)}
						{@render field(r)}
					{/each}
					{#if current.feedTypes}
						<h3>Event types shown by default</h3>
						<p class="muted small">Uncheck a type to hide it from the feed; a type picked by hand on the feed page takes precedence.</p>
						<div class="types">
							{#each Object.entries(FEED_META) as [t, m] (t)}
								<label class="type"><input type="checkbox" checked={typeEnabled(t)} onchange={() => toggleType(t)} /><Icon name={m.icon} /> {m.label}</label>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</Page>

<style>
	.layout {
		display: grid;
		grid-template-columns: 180px minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		position: sticky;
		top: 0;
	}
	nav button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: var(--r);
		color: var(--text-dim);
	}
	nav button:hover {
		background: var(--bg-2);
		color: var(--text);
	}
	nav button.on {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 600;
	}
	.ico {
		width: 20px;
		text-align: center;
	}
	.panel {
		padding: 18px 22px 10px;
	}
	h2 {
		font-size: 16px;
		font-weight: 700;
		margin-bottom: 6px;
	}
	h3 {
		margin: 22px 0 4px;
		font-size: 13px;
		font-weight: 650;
	}
	.intro {
		margin: 4px 0 8px;
	}
	.bar {
		margin: 10px 0 6px;
	}
	.acct {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
		padding: 12px 0;
		border-bottom: 1px solid var(--border);
	}
	.acct:last-child {
		border-bottom: 0;
	}
	.who {
		flex: 1;
		min-width: 200px;
	}
	.n {
		font-weight: 600;
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 10px;
		margin-top: 3px;
	}
	.types {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 4px 10px;
		margin: 10px 0 12px;
	}
	.type {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 6px;
		border-radius: var(--r-sm);
		cursor: pointer;
	}
	.type:hover {
		background: var(--bg-2);
	}
	.debug {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 16px 0 10px;
	}

	@media (max-width: 760px) {
		.layout {
			grid-template-columns: 1fr;
		}
		nav {
			position: static;
			flex-direction: row;
			overflow-x: auto;
		}
		nav button {
			white-space: nowrap;
		}
	}
</style>
