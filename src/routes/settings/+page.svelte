<script>
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
		{ id: 'accounts', icon: '👤', label: '账号' },
		{
			id: 'general',
			icon: '⚙️',
			label: '常规',
			rows: [
				{ key: 'ui.theme', kind: 'select', label: '主题', desc: '深色、浅色，或跟随系统', options: [['dark', '深色'], ['light', '浅色'], ['system', '跟随系统']] },
				{ key: 'ui.trustColors', kind: 'toggle', label: '信任等级颜色', desc: '按 VRChat 信任等级给用户名上色' },
				{ key: 'ui.showInstanceId', kind: 'toggle', label: '显示实例编号', desc: '在世界旁边显示实例的简短标识' },
				{ key: 'ui.hideSelfInFeed', kind: 'toggle', label: '动态里隐藏自己', desc: '不显示你的账号自己产生的事件' }
			]
		},
		{
			id: 'feed',
			icon: '📡',
			label: '动态',
			rows: [
				{ key: 'feed.maxEntries', kind: 'number', min: 100, max: 5000, step: 100, label: '页面保留条数', desc: '动态列表在浏览器里最多保留多少条' },
				{ key: 'feed.retentionDays', kind: 'number', min: 0, max: 365, step: 1, label: '历史保留天数', desc: '数据库里保存多久的动态；0 表示不清理' }
			],
			feedTypes: true
		},
		{
			id: 'notification',
			icon: '🔔',
			label: '通知',
			rows: [
				{ key: 'notification.desktop', kind: 'desktop', label: '桌面通知', desc: '页面在后台时弹出系统通知（浏览器需要 https 或 localhost 才支持）' },
				{ key: 'notification.friendOnline', kind: 'toggle', label: '好友上线', desc: '好友从离线变为在线时通知' },
				{ key: 'notification.invite', kind: 'toggle', label: '邀请', desc: '收到实例邀请时通知' },
				{ key: 'notification.friendRequest', kind: 'toggle', label: '好友请求', desc: '收到好友请求时通知' }
			]
		},
		{
			id: 'chatbox',
			icon: '💬',
			label: 'Chatbox',
			intro: 'Chatbox 通过 OSC (UDP) 发给运行 VRChat 的那台机器：填它的 IP；本机就是 127.0.0.1。',
			rows: [
				{ key: 'chatbox.host', kind: 'text', placeholder: '127.0.0.1', label: '目标地址', desc: 'VRChat 客户端所在机器的 IP 或域名' },
				{ key: 'chatbox.port', kind: 'number', min: 1, max: 65535, step: 1, label: '目标端口', desc: 'VRChat 的 OSC 默认端口是 9000' },
				{ key: 'chatbox.keepHistory', kind: 'toggle', label: '保留历史', desc: '在浏览器里记住最近发送的消息' },
				{ key: 'chatbox.historyMax', kind: 'number', min: 0, max: 100, step: 1, label: '历史条数', desc: '最多保留多少条' }
			]
		},
		{
			id: 'friend',
			icon: '👥',
			label: '好友列表',
			rows: [
				{ key: 'friend.showLastSeen', kind: 'toggle', label: '显示最后在线时间', desc: '离线好友旁边显示多久前离线' },
				{ key: 'friend.sortOfflineBy', kind: 'select', label: '离线好友排序', desc: '右侧列表和好友总览里离线好友的顺序', options: [['lastSeen', '最近在线优先'], ['name', '按名字']] }
			]
		},
		{ id: 'advanced', icon: '🔧', label: '高级' }
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
		if (typeof Notification === 'undefined') return toasts.error('当前浏览器环境不支持桌面通知（需要 https 或 localhost）');
		const permission = await Notification.requestPermission();
		if (permission === 'granted') {
			set('notification.desktop', true);
			toasts.success('已开启桌面通知');
		} else {
			set('notification.desktop', false);
			toasts.error('没有拿到通知权限');
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
			if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new Error('不是设置文件');
			await saveSettings(updates);
			toasts.success('已导入设置');
		} catch (err) {
			toasts.error(`导入失败：${err.message}`);
		}
	}

	async function resetAll() {
		if (!(await askConfirm('把所有设置恢复为默认值？', { okLabel: '重置', danger: true }))) return;
		await run(() => resetSettings(), '已重置全部设置');
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

<Page title="设置" icon="⚙️" width="wide">
	{#if !$settingsLoaded}
		<Notice kind="loading" />
	{:else}
		<div class="layout">
			<nav>
				{#each SECTIONS as s (s.id)}
					<button class:on={section === s.id} onclick={() => (section = s.id)}><span class="ico">{s.icon}</span>{s.label}</button>
				{/each}
			</nav>

			<div class="card panel">
				<h2>{current.label}</h2>

				{#if section === 'accounts'}
					<div class="row bar">
						<button class="btn primary sm" onclick={() => addAccountOpen.set(true)}>＋ 添加账号</button>
						<button class="btn ghost sm" onclick={() => refreshAccounts()}>↻ 刷新</button>
					</div>
					{#if !$accounts.length}
						<Notice icon="🔑" text="还没有账号，点「添加账号」登录你的 VRChat 账号" />
					{/if}
					{#each $accounts as a (a.id)}
						<div class="acct">
							<Avatar src={a.currentUser?.currentAvatarThumbnailImageUrl} name={accountLabel(a)} size={42} accountId={a.id} dot={a.connected ? 'var(--online)' : a.loggedIn ? 'var(--warn)' : 'var(--offline)'} />
							<div class="who">
								<div class="n">{accountLabel(a)}</div>
								<div class="faint small ellipsis">{a.username}{a.currentUser?.id ? ` · ${a.currentUser.id}` : ''}</div>
								<div class="meta">
									{#if a.connected}<span class="badge ok">已连接</span>
									{:else if a.loggedIn}<span class="badge warn">已登录 · 未连接</span>
									{:else}<span class="badge">未登录</span>{/if}
									{#if a.lastLoginAt}<span class="faint small">登录于 {formatDateTime(a.lastLoginAt)}</span>{/if}
									{#if a.lastError}<span class="error-text small">⚠ {a.lastError}</span>{/if}
								</div>
							</div>
							<AccountControls account={a} />
						</div>
					{/each}
				{:else if section === 'advanced'}
					<SettingRow label="导出设置" desc="把所有设置下载为 JSON 文件">
						<button class="btn" onclick={exportAll}>导出</button>
					</SettingRow>
					<SettingRow label="导入设置" desc="从 JSON 文件恢复（覆盖同名设置）">
						<label class="btn">选择文件<input type="file" accept="application/json" hidden onchange={importFile} /></label>
					</SettingRow>
					<SettingRow label="重置全部设置" desc="恢复为默认值，不会影响账号和历史动态">
						<button class="btn danger" onclick={resetAll}>重置</button>
					</SettingRow>
					<div class="debug muted small">
						<div>数据库：<code>data/vrcx-ng.db</code></div>
						<div>服务：<code>systemctl --user status vrcx-ng</code></div>
						<div>日志：<code>journalctl --user -u vrcx-ng -f</code></div>
					</div>
				{:else}
					{#if current.intro}<p class="muted small intro">{current.intro}</p>{/if}
					{#each current.rows as r (r.key)}
						{@render field(r)}
					{/each}
					{#if current.feedTypes}
						<h3>默认显示的事件类型</h3>
						<p class="muted small">取消勾选就不在动态里显示；在动态页上手动选中某个类型时，以选中的为准。</p>
						<div class="types">
							{#each Object.entries(FEED_META) as [t, m] (t)}
								<label class="type"><input type="checkbox" checked={typeEnabled(t)} onchange={() => toggleType(t)} />{m.icon} {m.label}</label>
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
