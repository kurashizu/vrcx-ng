<script>
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { settings, loadSettings, updateSetting } from '$lib/stores/settings.js';
	import { toasts } from '$lib/stores/toast.js';

	const MAX = { chars: 144, lines: 9 };

	let text = $state('');
	let sfx = $state(true);
	let typing = $state(false);
	let auto = $state(false);
	let health = $state({ ok: false, status: '检查中…' });
	let history = $state([]);
	let pendingTimer = null;
	let lastAutoSendAt = 0;
	let autoBarFillEl = $state(null);

	let host = $derived($settings['chatbox.host'] || '127.0.0.1');
	let port = $derived($settings['chatbox.port'] || 9000);

	const HIST_KEY = 'vrc-chatbox-history';

	onMount(() => {
		if (!browser) return;
		loadSettings();
		loadHistory();
		checkHealth();
		const id = setInterval(checkHealth, 10000);
		return () => clearInterval(id);
	});

	function loadHistory() {
		try {
			history = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
		} catch {
			history = [];
		}
	}

	function saveHistory() {
		const max = $settings['chatbox.historyMax'] || 20;
		if (!$settings['chatbox.keepHistory']) {
			localStorage.removeItem(HIST_KEY);
			return;
		}
		localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(0, max)));
	}

	function pushHistory(msg) {
		history = [msg, ...history.filter((x) => x !== msg)].slice(
			0,
			$settings['chatbox.historyMax'] || 20
		);
		saveHistory();
	}

	function clearHistory() {
		if (!confirm('清空所有历史？')) return;
		history = [];
		saveHistory();
	}

	async function postJson(url, body) {
		const r = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!r.ok) {
			const t = await r.text();
			throw new Error(`${r.status} ${t}`);
		}
		return r.json();
	}

	async function checkHealth() {
		try {
			const r = await fetch('/api/chatbox/health', { cache: 'no-store' });
			const j = await r.json();
			if (j.ok) {
				health = { ok: true, status: '在线', target: `${j.vrc_host}:${j.vrc_port}` };
			} else {
				health = {
					ok: false,
					status: '无法解析',
					target: `${j.vrc_host}:${j.vrc_port} · ${j.error || '?'}`
				};
			}
		} catch {
			health = { ok: false, status: '服务离线' };
		}
	}

	function lines() {
		return text === '' ? 0 : text.split('\n').length;
	}
	function chars() {
		return text.length;
	}

	async function sendMessage(immediate) {
		const v = text;
		if (!v) {
			toast('内容不能为空', 'error');
			return;
		}
		if (v.length > MAX.chars || v.split('\n').length > MAX.lines) {
			toast('超出字数/行数限制', 'error');
			return;
		}
		try {
			await postJson('/api/chatbox/send', { text: v, immediate, sfx });
			toast(immediate ? '已发送 ✓' : '已填入键盘', 'success');
			pushHistory(v);
			if (immediate) text = '';
		} catch (err) {
			toast('失败: ' + err.message, 'error');
		}
	}

	async function setTypingApi(on) {
		try {
			await postJson('/api/chatbox/typing', { typing: on });
			typing = on;
			toast(on ? 'typing 显示中' : 'typing 已停止', 'success');
		} catch (err) {
			toast('失败: ' + err.message, 'error');
		}
	}

	// Auto-send
	function pulseBar() {
		if (!autoBarFillEl) return;
		autoBarFillEl.classList.remove('running');
		void autoBarFillEl.offsetWidth;
		autoBarFillEl.classList.add('running');
	}

	async function doAutoSend(v) {
		try {
			await postJson('/api/chatbox/send', { text: v, immediate: true, sfx });
			lastAutoSendAt = Date.now();
			pulseBar();
			// stop typing indicator after send
			if (typing) setTypingApi(false);
		} catch (err) {
			toast('自动发送失败: ' + err.message, 'error');
			auto = false;
			stopAutoSend();
		}
	}

	function onAutoInput() {
		if (!auto) return;
		const v = text;
		if (!v) return;
		if (typing !== true) setTypingApi(true);
		const since = Date.now() - lastAutoSendAt;
		if (since >= 1500) {
			if (pendingTimer) clearTimeout(pendingTimer);
			doAutoSend(v);
		} else {
			if (pendingTimer) clearTimeout(pendingTimer);
			pendingTimer = setTimeout(() => {
				pendingTimer = null;
				if (!auto) return;
				const v2 = text;
				if (v2) doAutoSend(v2);
			}, 1500 - since);
		}
	}

	function startAutoSend() {
		lastAutoSendAt = 0;
		if (pendingTimer) clearTimeout(pendingTimer);
		pulseBar();
	}
	function stopAutoSend() {
		if (pendingTimer) {
			clearTimeout(pendingTimer);
			pendingTimer = null;
		}
		if (typing) setTypingApi(false);
	}
	$effect(() => {
		if (auto) startAutoSend();
		else stopAutoSend();
	});

	// Keyboard shortcuts
	function handleKeydown(e) {
		const mod = e.metaKey || e.ctrlKey;
		if (e.altKey || e.isComposing) return;

		if (!mod && e.key === 'Escape' && document.activeElement?.tagName === 'TEXTAREA') {
			e.preventDefault();
			text = '';
			return;
		}
		if (!mod) return;
		const k = e.key.toLowerCase();
		if (k === 'enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage(true);
		} else if (k === 'k') {
			e.preventDefault();
			text = '';
		} else if (k === 'l') {
			e.preventDefault();
			setTypingApi(!typing);
		} else if (k === '.') {
			e.preventDefault();
			auto = !auto;
		}
	}

	onMount(() => {
		if (browser) window.addEventListener('keydown', handleKeydown);
		return () => browser && window.removeEventListener('keydown', handleKeydown);
	});

	function sendFromHistory(msg) {
		text = msg;
		sendMessage(true);
	}
	function appendFromHistory(msg) {
		text = (text ? text + '\n' : '') + msg;
	}
</script>

<svelte:head>
	<title>Chatbox · vrcx-ng</title>
</svelte:head>

<div class="page">
	<header>
		<a href="/" class="back">←</a>
		<h1>Chatbox</h1>
		<div class="status">
			<span class="dot" class:ok={health.ok} class:err={!health.ok}></span>
			<span>{health.status}</span>
		</div>
	</header>

	<div class="target">
		→ {host}:{port}
		{#if health.target && health.target !== `${host}:${port}`}
			<span class="faint">· {health.target}</span>
		{/if}
		<a href="/settings" class="cfg">⚙</a>
	</div>

	<div class="field">
		<textarea
			bind:value={text}
			placeholder={`说点什么…（最多 ${MAX.chars} 字 / ${MAX.lines} 行）`}
			maxlength={MAX.chars}
			oninput={onAutoInput}
		></textarea>
		<div class="meta">
			<span class:over={lines() > MAX.lines}>{lines()} 行</span>
			<span class:over={chars() > MAX.chars}>{chars()} / {MAX.chars}</span>
		</div>
	</div>

	<div class="opts">
		<button class="opt" class:on={sfx} onclick={() => (sfx = !sfx)}>
			<span>{sfx ? '🔔' : '🔕'}</span>
			<span>提示音</span>
		</button>
		<button class="opt" class:on={typing} onclick={() => setTypingApi(!typing)}>
			<span>⌨️</span>
			<span>正在输入</span>
		</button>
		<button class="opt" class:on={auto} onclick={() => (auto = !auto)}>
			<span>🔁</span>
			<span>自动 1.5s</span>
		</button>
	</div>

	<div class="auto-bar" class:show={auto}>
		<div bind:this={autoBarFillEl} class="auto-bar-fill"></div>
	</div>

	<div class="actions">
		<button class="btn btn-primary" onclick={() => sendMessage(true)} title="Ctrl/⌘+Enter">
			发送
		</button>
		<button class="btn btn-secondary" onclick={() => sendMessage(false)}>填键盘</button>
	</div>

	<div class="btn-row">
		<button class="btn-mini" onclick={() => (text = '')}>清空</button>
		<button class="btn-mini" onclick={() => setTypingApi(false)}>停止 typing</button>
		<button class="btn-mini" onclick={checkHealth}>重测</button>
	</div>

	<div class="hint">
		<code>Ctrl/⌘+Enter</code> 发送 ·
		<code>Ctrl/⌘+K</code> 清空 ·
		<code>Ctrl/⌘+L</code> typing ·
		<code>Ctrl/⌘+.</code> 自动发送
	</div>

	{#if history.length > 0}
		<section class="group">
			<h2>最近</h2>
			<div class="history">
				{#each history.slice(0, 8) as msg, i (i + msg)}
					<div class="h-item" onclick={() => appendFromHistory(msg)} role="button" tabindex="0">
						<span class="h-text">{msg}</span>
						<button class="h-send" onclick={(e) => { e.stopPropagation(); sendFromHistory(msg); }}>
							发送
						</button>
					</div>
				{/each}
			</div>
			<button class="clear-history" onclick={clearHistory}>清空历史</button>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 12px 14px 32px;
		min-height: 100vh;
		padding-top: max(12px, env(safe-area-inset-top));
		padding-bottom: max(32px, env(safe-area-inset-bottom));
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 4px;
	}
	header h1 {
		margin: 0;
		font-size: 18px;
		flex: 1;
	}
	.back {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		color: var(--text-dim);
		text-decoration: none;
	}
	.back:hover {
		background: var(--bg-3);
		color: var(--text);
		text-decoration: none;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--text-dim);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-dim);
		transition: background 0.3s;
	}
	.dot.ok {
		background: var(--success);
		box-shadow: 0 0 8px var(--success);
	}
	.dot.err {
		background: var(--danger);
	}
	.target {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 12px;
		color: var(--text-dim);
		padding: 4px 4px 14px;
	}
	.target .cfg {
		margin-left: auto;
		color: var(--text-faint);
		text-decoration: none;
		font-size: 14px;
		padding: 2px 6px;
		border-radius: 4px;
	}
	.target .cfg:hover {
		background: var(--bg-3);
		color: var(--text);
	}
	.field {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px 14px;
	}
	textarea {
		width: 100%;
		min-height: 90px;
		resize: vertical;
		background: transparent;
		color: var(--text);
		border: 0;
		outline: 0;
		font: inherit;
		line-height: 1.5;
		padding: 0;
	}
	textarea:focus {
		box-shadow: none;
	}
	.meta {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		color: var(--text-dim);
		margin-top: 6px;
	}
	.meta .over {
		color: var(--danger);
	}
	.opts {
		display: flex;
		gap: 8px;
		margin: 12px 0;
		flex-wrap: wrap;
	}
	.opt {
		flex: 1 1 auto;
		min-width: 90px;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 8px;
		color: var(--text-dim);
		font-size: 13px;
		cursor: pointer;
	}
	.opt.on {
		border-color: var(--accent);
		color: var(--accent);
	}
	.opt:active {
		transform: scale(0.97);
	}
	.auto-bar {
		height: 0;
		opacity: 0;
		background: transparent;
		border-radius: 2px;
		overflow: hidden;
		transition: height 0.2s, opacity 0.2s, margin 0.2s;
	}
	.auto-bar.show {
		height: 3px;
		opacity: 1;
		margin: 4px 0 12px;
		background: var(--bg-2);
	}
	.auto-bar-fill {
		height: 100%;
		width: 0;
		background: linear-gradient(90deg, var(--accent), #8aa9ff);
	}
	.auto-bar-fill.running {
		animation: fill 1.5s linear forwards;
	}
	@keyframes fill {
		from { width: 0; }
		to { width: 100%; }
	}
	.actions {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 8px;
		margin: 10px 0 18px;
	}
	.btn {
		min-height: 52px;
		border: 0;
		border-radius: 12px;
		font: 600 15px/1 inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		transition: transform 0.08s, background 0.15s;
	}
	.btn:active {
		transform: scale(0.97);
	}
	.btn-primary {
		background: var(--accent);
		color: white;
	}
	.btn-secondary {
		background: var(--bg-3);
		color: var(--text);
	}
	.btn-row {
		display: flex;
		gap: 8px;
	}
	.btn-mini {
		flex: 1;
		min-height: 44px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text-dim);
		font: 13px inherit;
		cursor: pointer;
	}
	.btn-mini:active {
		background: var(--bg-3);
		color: var(--text);
	}
	.hint {
		margin: 14px 0 6px;
		padding: 8px 12px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		font-size: 11.5px;
		color: var(--text-dim);
		text-align: center;
	}
	.hint code {
		background: var(--bg-3);
		color: var(--text);
		padding: 1px 6px;
		border-radius: 4px;
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 11px;
	}
	.group {
		margin-top: 18px;
	}
	.group h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: var(--text-dim);
		margin: 0 0 8px;
		font-weight: 600;
	}
	.history {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.h-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		cursor: pointer;
		min-height: 44px;
	}
	.h-item:active {
		background: var(--bg-3);
	}
	.h-text {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 14px;
	}
	.h-send {
		background: var(--accent);
		color: white;
		border: 0;
		border-radius: 8px;
		padding: 6px 12px;
		font: 13px inherit;
		font-weight: 600;
		cursor: pointer;
		min-height: 32px;
		flex-shrink: 0;
	}
	.clear-history {
		margin-top: 8px;
		min-height: 44px;
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: 12px;
		color: var(--text-dim);
		font: 13px inherit;
		cursor: pointer;
		width: 100%;
	}
</style>
