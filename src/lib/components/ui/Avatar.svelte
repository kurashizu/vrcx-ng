<script>
	import { vrImage, initialOf, hueOf } from '$lib/shared/format.js';
	import { presenceColor } from '$lib/shared/presence.js';

	/**
	 * Picture with a lettered fallback (private avatars have no thumbnail, and
	 * some thumbnails 404), optional presence dot and account pip.
	 *
	 * @type {{
	 *   src?: string,
	 *   name?: string,
	 *   size?: number,
	 *   accountId?: string,
	 *   presence?: 'online'|'active'|'offline',
	 *   status?: string,
	 *   dot?: string,
	 *   pip?: string,
	 *   square?: boolean
	 * }}
	 */
	let { src = '', name = '', size = 36, accountId = '', presence, status = '', dot = '', pip = '', square = false } = $props();

	let failed = $state(false);
	$effect(() => {
		src;
		failed = false;
	});
</script>

<span class="avatar" class:square style:--s="{size}px" style:--hue={hueOf(name)}>
	{#if src && !failed}
		<img src={vrImage(src, accountId)} alt="" loading="lazy" onerror={() => (failed = true)} />
	{:else}
		<span class="init">{initialOf(name)}</span>
	{/if}
	{#if dot || presence}
		<span class="dot" style:--c={dot || presenceColor(presence, status)} title={presence}></span>
	{/if}
	{#if pip}
		<span class="pip" style:--hue={hueOf(pip)} title={pip}>{initialOf(pip)}</span>
	{/if}
</span>

<style>
	.avatar {
		position: relative;
		flex: none;
		display: inline-grid;
		place-items: center;
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		background: hsl(var(--hue) 38% 32%);
		color: #fff;
		font-size: calc(var(--s) * 0.42);
		font-weight: 600;
	}
	.square {
		border-radius: calc(var(--s) * 0.22);
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: inherit;
	}
	.dot {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: max(9px, calc(var(--s) * 0.28));
		height: max(9px, calc(var(--s) * 0.28));
		border-radius: 50%;
		background: var(--c);
		border: 2px solid var(--bg-1);
		box-sizing: border-box;
	}
	.pip {
		position: absolute;
		left: -3px;
		bottom: -3px;
		width: max(14px, calc(var(--s) * 0.38));
		height: max(14px, calc(var(--s) * 0.38));
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: hsl(var(--hue) 55% 42%);
		border: 2px solid var(--bg-1);
		box-sizing: border-box;
		font-size: max(8px, calc(var(--s) * 0.2));
		font-weight: 700;
	}
</style>
