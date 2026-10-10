<script>
	import Icon from '$lib/components/ui/Icon.svelte';
	import { onMount, onDestroy, untrack } from 'svelte';
	import { settings } from '$lib/stores/settings.js';
	import { toasts } from '$lib/stores/toast.js';
	import { api, run } from '$lib/client/api.js';
	import { askConfirm } from '$lib/stores/overlay.js';
	import Page from '$lib/components/ui/Page.svelte';

	const MAX = { chars: 144, lines: 9 };
	const HISTORY_KEY = 'vrc-chatbox-history';
	const AUTO_DELAY = 1500;

	let text = $state('');
	let sfx = $state(true);
	let typing = $state(false);
	let auto = $state(false);
	let health = $state({ ok: false, status: 'Checking…', detail: '' });
	let history = $state(/** @type {string[]} */ ([]));
	/** bumped on every auto-send so the progress bar restarts */
	let pulse = $state(0);

	let pendingTimer = null;
	let lastAutoSendAt = 0;

	const host = $derived($settings['chatbox.host'] || '127.0.0.1');
	const port = $derived($settings['chatbox.port'] || 9000);
	const lineCount = $derived(text ? text.split('\n').length : 0);
	const over = $derived(text.length > MAX.chars || lineCount > MAX.lines);

	// ---- history (browser-local) ----
	const historyMax = () => $settings['chatbox.historyMax'] || 20;
	function saveHistory() {
		if (!$settings['chatbox.keepHistory']) return localStorage.removeItem(HISTORY_KEY);
		localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, historyMax())));
	}
	function remember(msg) {
		history = [msg, ...history.filter((x) => x !== msg)].slice(0, historyMax());
		saveHistory();
	}
	async function clearHistory() {
		if (!(await askConfirm('Clear all message history?', { okLabel: 'Clear', danger: true }))) return;
		history = [];
		saveHistory();
	}

	// ---- OSC bridge ----
	async function checkHealth() {
		try {
			const j = await api('/api/chatbox/health');
			health = { ok: true, status: 'Ready', detail: `${j.vrc_host}:${j.vrc_port}` };
		} catch (err) {
			health = { ok: false, status: 'Cannot resolve target', detail: err.message };
		}
	}

	const post = (url, body) => api(url, { method: 'POST', body });

	async function send(immediate) {
		if (!text) return toasts.error('Message must not be empty');
		if (over) return toasts.error('Over the character / line limit');
		const sent = text;
		if (await run(() => post('/api/chatbox/send', { text: sent, immediate, sfx }), immediate ? 'Sent' : 'Put into the keyboard')) {
			remember(sent);
			if (immediate) text = '';
		}
	}

	async function setTyping(on) {
		if (await run(() => post('/api/chatbox/typing', { typing: on }))) typing = on;
	}

	// ---- auto-send: first keystroke goes out at once, later ones at most every 1.5 s ----
	async function autoSend(value) {
		try {
			await post('/api/chatbox/send', { text: value, immediate: true, sfx });
			lastAutoSendAt = Date.now();
			pulse++;
			if (typing) setTyping(false);
		} catch (err) {
			toasts.error(`Auto-send failed: ${err.message}`);
			auto = false;
		}
	}

	function onInput() {
		if (!auto || !text) return;
		if (!typing) setTyping(true);
		clearTimeout(pendingTimer);
		const wait = Math.max(0, AUTO_DELAY - (Date.now() - lastAutoSendAt));
		pendingTimer = setTimeout(() => {
			pendingTimer = null;
			if (auto && text) autoSend(text);
		}, wait);
	}

	// untracked: reading `typing` here must not re-run the effect
	// (that would switch a manually enabled typing indicator off again)
	$effect(() => {
		const on = auto;
		untrack(() => {
			clearTimeout(pendingTimer);
			pendingTimer = null;
			if (on) {
				lastAutoSendAt = 0;
				pulse++;
			} else if (typing) setTyping(false);
		});
	});

	function onKeydown(e) {
		if (e.altKey || e.isComposing) return;
		const mod = e.metaKey || e.ctrlKey;
		if (!mod) {
			if (e.key === 'Escape' && document.activeElement?.tagName === 'TEXTAREA') (e.preventDefault(), (text = ''));
			return;
		}
		const k = e.key.toLowerCase();
		if (k === 'enter' && !e.shiftKey) (e.preventDefault(), send(true));
		else if (k === 'k') (e.preventDefault(), (text = ''));
		else if (k === 'l') (e.preventDefault(), setTyping(!typing));
		else if (k === '.') (e.preventDefault(), (auto = !auto));
	}

	onMount(() => {
		try {
			history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
		} catch {}
		checkHealth();
		const id = setInterval(checkHealth, 10000);
		return () => clearInterval(id);
	});

	onDestroy(() => {
		clearTimeout(pendingTimer);
		if (typing) post('/api/chatbox/typing', { typing: false }).catch(() => {});
	});
</script>

<svelte:window onkeydown={onKeydown} />

<Page title="Chatbox" icon="message" subtitle="Send text into the VRChat chatbox over OSC" width="narrow">
	{#snippet actions()}
		<span class="status" class:ok={health.ok} title={health.detail}><i></i>{health.status}</span>
		<a class="btn ghost sm" href="/settings" title="Change target address"><Icon name="arrow-right" /> {host}:{port}</a>
	{/snippet}

	<div class="card editor">
		<textarea bind:value={text} oninput={onInput} maxlength={MAX.chars} rows="5" placeholder="Say something… (max {MAX.chars} chars / {MAX.lines} lines)"></textarea>
		<div class="count">
			<span class:bad={lineCount > MAX.lines}>{lineCount} lines</span>
			<span class:bad={text.length > MAX.chars}>{text.length} / {MAX.chars}</span>
		</div>
		{#if auto}
			<div class="auto-bar">
				{#key pulse}<div class="fill"></div>{/key}
			</div>
		{/if}
	</div>

	<div class="opts">
		<button class="chip" class:on={sfx} aria-pressed={sfx} onclick={() => (sfx = !sfx)}><Icon name={sfx ? 'bell' : 'bell-off'} /> Sound</button>
		<button class="chip" class:on={typing} aria-pressed={typing} onclick={() => setTyping(!typing)}><Icon name="keyboard" /> Typing indicator</button>
		<button class="chip" class:on={auto} aria-pressed={auto} onclick={() => (auto = !auto)}><Icon name="repeat" /> Auto-send</button>
	</div>

	<div class="row">
		<button class="btn primary send" disabled={!text || over} onclick={() => send(true)}>Send</button>
		<button class="btn" disabled={!text || over} onclick={() => send(false)} title="Only fill the in-game keyboard, do not send">Fill keyboard</button>
		<button class="btn ghost" onclick={() => (text = '')}>Clear</button>
		<span class="spacer"></span>
		<button class="btn ghost sm" onclick={checkHealth}>Re-check</button>
	</div>

	<p class="faint small keys">
		<kbd>Ctrl/⌘ + Enter</kbd> send · <kbd>Ctrl/⌘ + K</kbd> clear · <kbd>Ctrl/⌘ + L</kbd> typing · <kbd>Ctrl/⌘ + .</kbd> auto-send
	</p>

	{#if history.length}
		<section class="card history">
			<div class="row head">
				<h2>Recent</h2>
				<span class="spacer"></span>
				<button class="btn ghost xs" onclick={clearHistory}>Clear history</button>
			</div>
			{#each history.slice(0, 8) as msg (msg)}
				<div class="item" role="button" tabindex="0" title="Click to append to the input" onclick={() => (text = (text ? text + '\n' : '') + msg)} onkeydown={(e) => e.key === 'Enter' && (text = (text ? text + '\n' : '') + msg)}>
					<span class="msg">{msg}</span>
					<button class="btn xs" onclick={(e) => (e.stopPropagation(), (text = msg), send(true))}>Send</button>
				</div>
			{/each}
		</section>
	{/if}
</Page>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		color: var(--text-dim);
	}
	.status i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--danger);
	}
	.status.ok i {
		background: var(--online);
	}
	.editor {
		position: relative;
		padding: 12px;
	}
	.editor textarea {
		border: 0;
		background: transparent;
		padding: 2px;
		font-size: 15px;
		box-shadow: none;
	}
	.count {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		font-size: 12px;
		color: var(--text-faint);
	}
	.bad {
		color: var(--danger);
	}
	.auto-bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		overflow: hidden;
		border-radius: 0 0 var(--r-lg) var(--r-lg);
	}
	.fill {
		height: 100%;
		background: var(--accent);
		transform-origin: left;
		animation: fill 1.5s linear forwards;
	}
	@keyframes fill {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}
	.opts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.opts .chip {
		padding: 4px 14px;
		font-size: 13px;
	}
	.send {
		min-width: 110px;
	}
	.keys kbd {
		margin: 0 1px;
	}
	.history {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h2 {
		font-size: 13px;
		font-weight: 650;
	}
	.head {
		margin-bottom: 4px;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-radius: var(--r);
		cursor: pointer;
	}
	.item:hover {
		background: var(--bg-2);
	}
	.msg {
		flex: 1;
		min-width: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--text-dim);
	}
</style>
