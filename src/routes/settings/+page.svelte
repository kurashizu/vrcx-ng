<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		settings,
		settingsLoaded,
		loadSettings,
		updateSetting,
		resetSettings
	} from '$lib/stores/settings.js';
	import { toasts } from '$lib/stores/toast.js';
	import {
		accounts,
		refreshAccounts,
		loginAccount,
		logoutAccount,
		reconnectAccount,
		removeAccount
	} from '$lib/stores/accounts.js';
	import AddAccountDialog from '$lib/components/AddAccountDialog.svelte';
	import TwoFactorDialog from '$lib/components/TwoFactorDialog.svelte';

	let activeCategory = $state('general');
	let addOpen = $state(false);
	let twofaOpen = $state(false);
	let twofaAccountId = $state('');
	let twofaMethods = $state([]);

	function on2faEvent(e) {
		twofaAccountId = e.detail.accountId;
		twofaMethods = e.detail.methods;
		twofaOpen = true;
	}

	async function doLogin(id) {
		const r = await loginAccount(id);
		if (r.requires2fa) {
			window.dispatchEvent(
				new CustomEvent('vrc-2fa-required', { detail: { accountId: id, methods: r.requires2fa } })
			);
		}
	}

	async function doRemove(id) {
		if (!confirm('删除该账号？本地保存的密码也会被移除。')) return;
		await removeAccount(id);
	}

	onMount(() => {
		if (browser) {
			loadSettings();
			refreshAccounts();
			window.addEventListener('vrc-2fa-required', on2faEvent);
		}
		return () => window.removeEventListener('vrc-2fa-required', on2faEvent);
	});

	onMount(() => {
		if (browser) loadSettings();
	});

	// Helpers
	function get(key) {
		return $settings[key];
	}
	function set(key, value) {
		updateSetting(key, value);
	}

	const CATEGORIES = [
		{ id: 'accounts', icon: '👤', label: '账号' },
		{ id: 'general', icon: '⚙️', label: '常规' },
		{ id: 'feed', icon: '📡', label: '动态' },
		{ id: 'notification', icon: '🔔', label: '通知' },
		{ id: 'chatbox', icon: '💬', label: 'Chatbox' },
		{ id: 'friend', icon: '👥', label: '好友列表' },
		{ id: 'advanced', icon: '🔧', label: '高级' }
	];

	const FEED_TYPES = [
		{ key: 'Online', label: '上线', icon: '🟢' },
		{ key: 'Offline', label: '离线', icon: '⚫' },
		{ key: 'Active', label: 'Active', icon: '🔵' },
		{ key: 'GPS', label: '移动世界', icon: '📍' },
		{ key: 'Status', label: '状态', icon: '💬' },
		{ key: 'Bio', label: 'Bio 更新', icon: '✏️' },
		{ key: 'Avatar', label: '模型', icon: '👤' },
		{ key: 'FriendRequest', label: '好友请求', icon: '🤝' },
		{ key: 'Invite', label: '邀请', icon: '✉️' },
		{ key: 'Instance.Closed', label: '实例关闭', icon: '🚪' },
		{ key: 'Notification', label: '通知', icon: '📨' },
		{ key: 'Group', label: '群组', icon: '👪' }
	];

	function feedTypeEnabled(key) {
		const map = get('feed.types') || {};
		return map[key] !== false;
	}
	function toggleFeedType(key) {
		const map = { ...(get('feed.types') || {}) };
		map[key] = !map[key];
		set('feed.types', map);
	}

	async function exportAll() {
		try {
			const r = await fetch('/api/settings');
			const j = await r.json();
			const blob = new Blob([JSON.stringify(j.settings, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'vrcx-ng-settings.json';
			a.click();
			URL.revokeObjectURL(url);
			toasts.push('已导出设置', 'success');
		} catch (err) {
			toasts.push('导出失败: ' + err.message, 'error');
		}
	}

	function importFile(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = async () => {
			try {
				const obj = JSON.parse(String(reader.result || ''));
				const updates = {};
				for (const k of Object.keys(obj)) updates[k] = obj[k];
				updateSetting('__import__', null); // trigger save
				// Send bulk update
				const r = await fetch('/api/settings', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ updates })
				});
				if (!r.ok) throw new Error('HTTP ' + r.status);
				settings.set({ ...$settings, ...updates });
				toasts.push('已导入设置', 'success');
			} catch (err) {
				toasts.push('导入失败: ' + err.message, 'error');
			}
		};
		reader.readAsText(file);
		e.target.value = '';
	}

	async function resetOne(key) {
		if (!confirm(`确定重置 "${key}" 为默认值？`)) return;
		await resetSettings(key);
		toasts.push(`已重置 ${key}`, 'success');
	}
	async function resetAll() {
		if (!confirm('确定重置全部设置为默认值？此操作不可撤销。')) return;
		await resetSettings();
		toasts.push('已重置全部设置', 'success');
	}
</script>

<svelte:head>
	<title>设置 · vrcx-ng</title>
</svelte:head>

<div class="settings-page">
	<header>
		<a href="/" class="back">← 返回</a>
		<h1>设置</h1>
	</header>

	{#if !$settingsLoaded}
		<div class="loading">加载中…</div>
	{:else}
		<div class="layout">
			<!-- 侧边栏分类 -->
			<nav class="sidebar">
				{#each CATEGORIES as c}
					<button
						class="cat"
						class:active={activeCategory === c.id}
						onclick={() => (activeCategory = c.id)}
					>
						<span class="ico">{c.icon}</span>
						<span>{c.label}</span>
					</button>
				{/each}
			</nav>

			<!-- 主内容 -->
			<main class="content">
				{#if activeCategory === 'accounts'}
					<h2>账号管理</h2>

					<div class="acct-toolbar">
						<button class="btn primary" onclick={() => (addOpen = true)}>＋ 添加账号</button>
						<button class="btn ghost" onclick={refreshAccounts}>↻ 刷新</button>
					</div>

					{#if $accounts.length === 0}
						<div class="empty">还没有账号。点击「添加账号」登录你的 VRChat 账号。</div>
					{:else}
						<div class="acct-list">
							{#each $accounts as a (a.id)}
								<div class="acct-card">
									<div class="acct-head">
										<div class="acct-avatar">
											{#if a.currentUser?.currentAvatarThumbnailImageUrl}
												<img
													src={a.currentUser.currentAvatarThumbnailImageUrl}
													alt=""
													loading="lazy"
												/>
											{:else}
												<span>{(a.displayName || a.username || '?').slice(0, 1).toUpperCase()}</span>
											{/if}
										</div>
										<div class="acct-id">
											<div class="acct-name">
												{a.displayName || a.username}
												<span class="dot" class:online={a.connected} class:logged={a.loggedIn && !a.connected}></span>
											</div>
											<div class="acct-username">{a.username}{a.currentUser?.id ? ` · ${a.currentUser.id}` : ''}</div>
											<div class="acct-meta">
												{#if a.connected}
													<span class="pill ok">已连接</span>
												{:else if a.loggedIn}
													<span class="pill warn">已登录 / 未连接</span>
												{:else}
													<span class="pill">未登录</span>
												{/if}
												{#if a.lastLoginAt}
													<span class="meta">登录于 {new Date(a.lastLoginAt).toLocaleString()}</span>
												{/if}
												{#if a.lastError}
													<span class="meta err">⚠ {a.lastError}</span>
												{/if}
											</div>
										</div>
									</div>
									<div class="acct-actions">
										<button class="btn xs" disabled={a.connected} onclick={() => reconnectAccount(a.id)} title="重新建立 websocket 连接">重连</button>
										{#if !a.loggedIn}
											<button class="btn xs" onclick={() => doLogin(a.id)}>重新登录</button>
										{/if}
										<button class="btn xs" disabled={!a.loggedIn} onclick={() => logoutAccount(a.id)}>登出</button>
										<button class="btn xs danger" onclick={() => doRemove(a.id)}>删除</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else if activeCategory === 'general'}
					<h2>常规</h2>

					<div class="setting-row">
						<div class="label">
							<div class="name">主题</div>
							<div class="desc">深色 / 浅色 / 跟随系统</div>
						</div>
						<div class="control">
							<select
								value={get('ui.theme') || 'dark'}
								onchange={(e) => set('ui.theme', e.target.value)}
							>
								<option value="dark">深色</option>
								<option value="light">浅色</option>
								<option value="system">跟随系统</option>
							</select>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">24 小时制</div>
							<div class="desc">时间显示格式</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('ui.hour12')}
									onchange={(e) => set('ui.hour12', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">显示实例 ID</div>
							<div class="desc">在世界显示中显示 instance 编号 (如 wrld_xxx:12345)</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('ui.showInstanceId')}
									onchange={(e) => set('ui.showInstanceId', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">Trust Rank 颜色</div>
							<div class="desc">按用户信任等级显示不同颜色（好友、信任用户、传奇等）</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('ui.trustColors')}
									onchange={(e) => set('ui.trustColors', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">自己不在动态里</div>
							<div class="desc">隐藏账号自己产生的状态变更</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('ui.hideSelfInFeed')}
									onchange={(e) => set('ui.hideSelfInFeed', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>
				{/if}

				{#if activeCategory === 'feed'}
					<h2>动态</h2>

					<div class="setting-row">
						<div class="label">
							<div class="name">最大缓存条目</div>
							<div class="desc">内存中保留的最新动态数量（超出后丢弃最早的）</div>
						</div>
						<div class="control" style="width: 120px">
							<input
								type="number"
								min="100"
								max="10000"
								step="100"
								value={get('feed.maxEntries') || 1000}
								onchange={(e) => set('feed.maxEntries', Number(e.target.value))}
							/>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">持久化天数</div>
							<div class="desc">SQLite 中保留的动态历史（0 = 不限制）</div>
						</div>
						<div class="control" style="width: 120px">
							<input
								type="number"
								min="0"
								max="365"
								step="1"
								value={get('feed.retentionDays') || 0}
								onchange={(e) => set('feed.retentionDays', Number(e.target.value))}
							/>
						</div>
					</div>

					<h3 class="sub-h">事件类型过滤</h3>
					<p class="muted small">取消勾选则在动态列表中隐藏该类型。</p>

					<div class="type-grid">
						{#each FEED_TYPES as t}
							<label class="type-row">
								<input
									type="checkbox"
									checked={feedTypeEnabled(t.key)}
									onchange={() => toggleFeedType(t.key)}
								/>
								<span class="ico">{t.icon}</span>
								<span class="lbl">{t.label}</span>
								<span class="key faint">{t.key}</span>
							</label>
						{/each}
					</div>
				{/if}

				{#if activeCategory === 'notification'}
					<h2>通知</h2>

					<div class="setting-row">
						<div class="label">
							<div class="name">桌面通知</div>
							<div class="desc">在浏览器中弹出系统通知（需先授予权限）</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('notification.desktop')}
									onchange={(e) => {
										const on = e.target.checked;
										if (on && browser && 'Notification' in window) {
											Notification.requestPermission().then((p) => {
												if (p === 'granted') {
													set('notification.desktop', true);
													toasts.push('已开启桌面通知', 'success');
												} else {
													toasts.push('未授予通知权限', 'error');
												}
											});
										} else {
											set('notification.desktop', on);
										}
									}}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<h3 class="sub-h">通知类型</h3>

					<div class="setting-row">
						<div class="label">
							<div class="name">好友上线</div>
							<div class="desc">当好友从离线变为在线时通知</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('notification.friendOnline')}
									onchange={(e) => set('notification.friendOnline', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">VIP 上线</div>
							<div class="desc">关注的 VIP 好友上线时通知（暂未实现名单）</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('notification.vipOnline')}
									onchange={(e) => set('notification.vipOnline', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">邀请</div>
							<div class="desc">收到实例邀请时通知</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('notification.invite')}
									onchange={(e) => set('notification.invite', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">好友请求</div>
							<div class="desc">收到好友请求时通知</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('notification.friendRequest')}
									onchange={(e) => set('notification.friendRequest', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>
				{/if}

				{#if activeCategory === 'chatbox'}
					<h2>Chatbox (OSC)</h2>
					<p class="muted small">
						VRChat 的 chatbox 通过 OSC UDP 接收。填写你跑 VRChat 客户端的那台机器的 IP（一般本机就是
						<code>127.0.0.1</code>，手机端从桌面客户端就要填桌面 IP）。
					</p>

					<div class="setting-row">
						<div class="label">
							<div class="name">目标 Host</div>
							<div class="desc">VRChat 客户端所在机器的 IP 或域名</div>
						</div>
						<div class="control" style="width: 200px">
							<input
								type="text"
								placeholder="127.0.0.1"
								value={get('chatbox.host') || '127.0.0.1'}
								onchange={(e) => set('chatbox.host', e.target.value.trim())}
							/>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">目标端口</div>
							<div class="desc">VRChat 默认 OSC 端口是 9000</div>
						</div>
						<div class="control" style="width: 120px">
							<input
								type="number"
								min="1"
								max="65535"
								value={get('chatbox.port') || 9000}
								onchange={(e) => set('chatbox.port', Number(e.target.value))}
							/>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">保留历史</div>
							<div class="desc">在浏览器 localStorage 中保存最近发送的消息</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('chatbox.keepHistory')}
									onchange={(e) => set('chatbox.keepHistory', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">历史条数</div>
							<div class="desc">最多保留多少条历史消息</div>
						</div>
						<div class="control" style="width: 120px">
							<input
								type="number"
								min="0"
								max="100"
								value={get('chatbox.historyMax') || 20}
								onchange={(e) => set('chatbox.historyMax', Number(e.target.value))}
							/>
						</div>
					</div>

					<div style="margin-top: 18px">
						<a href="/chatbox" class="open-chatbox">→ 打开 Chatbox 控制台</a>
					</div>
				{/if}

				{#if activeCategory === 'friend'}
					<h2>好友列表</h2>

					<div class="setting-row">
						<div class="label">
							<div class="name">显示 last seen</div>
							<div class="desc">离线好友旁显示最后在线时间</div>
						</div>
						<div class="control">
							<label class="toggle">
								<input
									type="checkbox"
									checked={!!get('friend.showLastSeen')}
									onchange={(e) => set('friend.showLastSeen', e.target.checked)}
								/>
								<span class="slider"></span>
							</label>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">离线好友排序</div>
							<div class="desc">离线列表的默认排序方式</div>
						</div>
						<div class="control">
							<select
								value={get('friend.sortOfflineBy') || 'lastSeen'}
								onchange={(e) => set('friend.sortOfflineBy', e.target.value)}
							>
								<option value="lastSeen">最后在线时间</option>
								<option value="name">显示名</option>
							</select>
						</div>
					</div>
				{/if}

				{#if activeCategory === 'advanced'}
					<h2>高级</h2>

					<div class="setting-row">
						<div class="label">
							<div class="name">导出设置</div>
							<div class="desc">把所有设置下载为 JSON 文件</div>
						</div>
						<div class="control">
							<button onclick={exportAll}>导出</button>
						</div>
					</div>

					<div class="setting-row">
						<div class="label">
							<div class="name">导入设置</div>
							<div class="desc">从 JSON 文件恢复（覆盖现有设置）</div>
						</div>
						<div class="control">
							<label class="file-btn">
								<input type="file" accept="application/json" onchange={importFile} />
								<span>选择文件</span>
							</label>
						</div>
					</div>

					<div class="setting-row danger">
						<div class="label">
							<div class="name">重置全部设置</div>
							<div class="desc">把所有设置恢复为默认值</div>
						</div>
						<div class="control">
							<button class="danger" onclick={resetAll}>重置</button>
						</div>
					</div>

					<h3 class="sub-h">调试信息</h3>
					<div class="debug-info">
						<div><span class="lbl">数据库:</span> <code>data/vrcx-ng.db</code></div>
						<div><span class="lbl">服务:</span> <code>vrcx-ng.service</code></div>
						<div><span class="lbl">日志:</span> <code>journalctl --user -u vrcx-ng -f</code></div>
					</div>
				{/if}
			</main>
		</div>
	{/if}
</div>

<AddAccountDialog bind:open={addOpen} onClose={() => (addOpen = false)} />
<TwoFactorDialog
	bind:open={twofaOpen}
	accountId={twofaAccountId}
	methods={twofaMethods}
	onClose={() => (twofaOpen = false)}
/>

<style>
	.settings-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 20px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-1);
		flex-shrink: 0;
	}
	header h1 {
		margin: 0;
		font-size: 18px;
	}
	.back {
		color: var(--text-dim);
		font-size: 13px;
		text-decoration: none;
		padding: 4px 10px;
		border-radius: 6px;
	}
	.back:hover {
		background: var(--bg-3);
		color: var(--text);
		text-decoration: none;
	}
	.loading {
		padding: 40px;
		text-align: center;
		color: var(--text-dim);
	}
	.layout {
		flex: 1;
		display: grid;
		grid-template-columns: 200px 1fr;
		min-height: 0;
	}
	.sidebar {
		border-right: 1px solid var(--border);
		background: var(--bg-1);
		padding: 12px 8px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.cat {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: var(--text-dim);
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		width: 100%;
	}
	.cat:hover {
		background: var(--bg-2);
		color: var(--text);
	}
	.cat.active {
		background: var(--bg-3);
		color: var(--text);
	}
	.cat .ico {
		font-size: 16px;
	}
	.content {
		overflow-y: auto;
		padding: 24px 32px;
		max-width: 720px;
	}
	.content h2 {
		margin: 0 0 16px;
		font-size: 16px;
		color: var(--text-dim);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.sub-h {
		margin: 24px 0 8px;
		font-size: 13px;
		color: var(--text-dim);
	}
	.muted {
		color: var(--text-dim);
	}
	.small {
		font-size: 12px;
	}
	.type-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px;
		margin-top: 8px;
	}
	.type-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		font-size: 13px;
	}
	.type-row:hover {
		background: var(--bg-3);
	}
	.type-row input {
		width: auto;
	}
	.type-row .ico {
		font-size: 14px;
	}
	.type-row .lbl {
		flex: 1;
	}
	.type-row .key {
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 11px;
	}
	.open-chatbox {
		display: inline-block;
		padding: 10px 16px;
		background: var(--accent);
		color: white;
		border-radius: 8px;
		font-weight: 500;
	}
	.open-chatbox:hover {
		text-decoration: none;
		filter: brightness(1.1);
	}
	.file-btn {
		display: inline-block;
		padding: 6px 12px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		border-radius: 8px;
		cursor: pointer;
		font-size: 13px;
	}
	.file-btn:hover {
		background: #2a2f4a;
	}
	.file-btn input {
		display: none;
	}
	.setting-row.danger {
		margin-top: 18px;
	}
	.debug-info {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 12px 16px;
		font-size: 12px;
		font-family: ui-monospace, 'SF Mono', monospace;
		color: var(--text-dim);
	}
	.debug-info div {
		margin-bottom: 4px;
	}
	.debug-info .lbl {
		display: inline-block;
		width: 80px;
		color: var(--text-faint);
	}

	/* ---- 账号管理 ---- */
	.acct-toolbar {
		display: flex;
		gap: 8px;
		margin-bottom: 14px;
	}
	.btn {
		background: var(--bg-2);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 8px;
		padding: 7px 14px;
		font-size: 13px;
		cursor: pointer;
	}
	.btn:hover {
		background: var(--bg-3);
	}
	.btn.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.btn.primary:hover {
		opacity: 0.9;
	}
	.btn.xs {
		padding: 4px 10px;
		font-size: 12px;
	}
	.btn.danger {
		color: var(--danger);
		border-color: rgba(255, 93, 108, 0.4);
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.empty {
		padding: 30px;
		text-align: center;
		color: var(--text-faint);
		background: var(--bg-2);
		border: 1px dashed var(--border);
		border-radius: 10px;
	}
	.acct-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.acct-card {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 12px 14px;
	}
	.acct-head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.acct-avatar {
		width: 46px;
		height: 46px;
		border-radius: 10px;
		overflow: hidden;
		flex: none;
		background: var(--bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 800;
		color: var(--text-dim);
		border: 1px solid var(--border);
	}
	.acct-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.acct-id {
		min-width: 0;
		flex: 1;
	}
	.acct-name {
		font-size: 14px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--text-faint);
		flex: none;
	}
	.dot.online {
		background: var(--online);
		box-shadow: 0 0 6px var(--online);
	}
	.dot.logged {
		background: var(--warn);
	}
	.acct-username {
		font-size: 12px;
		color: var(--text-dim);
		margin-top: 1px;
		word-break: break-all;
	}
	.acct-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 4px;
	}
	.pill {
		font-size: 10px;
		font-weight: 700;
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--bg-3);
		border: 1px solid var(--border);
		color: var(--text-faint);
	}
	.pill.ok {
		background: rgba(61, 220, 151, 0.12);
		color: var(--online);
		border-color: rgba(61, 220, 151, 0.3);
	}
	.pill.warn {
		background: rgba(255, 180, 84, 0.12);
		color: var(--warn);
		border-color: rgba(255, 180, 84, 0.3);
	}
	.meta {
		font-size: 11px;
		color: var(--text-faint);
	}
	.meta.err {
		color: var(--danger);
	}
	.acct-actions {
		display: flex;
		gap: 6px;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}

	/* 移动端：分类栏变横向滚动条，内容单列 */
	@media (max-width: 720px) {
		.layout {
			display: flex;
			flex-direction: column;
		}
		.sidebar {
			flex-direction: row;
			overflow-x: auto;
			border-right: none;
			border-bottom: 1px solid var(--border);
			padding: 6px 8px;
			flex: none;
			gap: 4px;
		}
		.cat {
			flex: none;
			white-space: nowrap;
			padding: 6px 12px;
		}
		.content {
			overflow-y: auto;
			padding: 14px 12px 40px;
		}
		.info-grid {
			grid-template-columns: 1fr;
		}
		header {
			padding: 10px 12px;
		}
	}
</style>
