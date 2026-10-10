<script>
	/**
	 * Lays out bubbles of any size without changing their size.
	 *
	 * - the width is divided into as many columns as fit `minBubble`; a bubble keeps its
	 *   natural size (`max-content`, at most one column wide) and is pinned to a column
	 *   line, so left edges always line up
	 * - every cell is measured with a ResizeObserver, so content changes re-layout by themselves
	 * - bubbles go in feed order into the lowest column; looking `lookahead` bubbles ahead,
	 *   the one whose height best levels that column with the next-lowest one is taken first,
	 *   so column bottoms stay flat and the board still reads roughly newest-first
	 * - a `header` item spans the whole width and levels all columns below it
	 * - cells slide to their new place when anything changes
	 *
	 * @type {{
	 *   items: { key: string, header?: boolean, data: any }[],
	 *   gap?: number,
	 *   maxBubble?: number,
	 *   minBubble?: number,
	 *   lookahead?: number,
	 *   item: import('svelte').Snippet<[any]>,
	 *   header?: import('svelte').Snippet<[any]>
	 * }}
	 */
	let { items, gap = 12, maxBubble = 520, minBubble = 320, lookahead = 6, item, header } = $props();

	let width = $state(0);
	let ready = $state(false);

	// widest a bubble may be: one column
	const cap = $derived.by(() => {
		if (width <= 0) return maxBubble;
		const c = Math.max(1, Math.floor((width + gap) / (minBubble + gap)));
		return Math.min(maxBubble, Math.floor((width - gap * (c - 1)) / c));
	});

	/** measured natural sizes; a version counter tells the layout something changed */
	const sizes = new Map();
	let version = $state(0);
	let pending = false;
	function bump() {
		if (pending) return;
		pending = true;
		queueMicrotask(() => {
			pending = false;
			version++;
		});
	}

	function measure(node, key) {
		let k = key;
		const read = () => {
			const w = node.offsetWidth;
			const h = node.offsetHeight;
			const old = sizes.get(k);
			if (!old || Math.abs(old.w - w) > 0.5 || Math.abs(old.h - h) > 0.5) {
				sizes.set(k, { w, h });
				bump();
			}
		};
		const ro = new ResizeObserver(read);
		ro.observe(node);
		read();
		return {
			update(next) {
				k = next;
				read();
			},
			destroy() {
				ro.disconnect();
				sizes.delete(k);
			}
		};
	}

	const cols = $derived(Math.max(1, Math.floor((width + gap) / (minBubble + gap))));

	const layout = $derived.by(() => {
		version;
		const W = width;
		if (W <= 0) return { pos: {}, height: 0 };
		const step = (W + gap) / cols;
		/** used height per column */
		const level = new Array(cols).fill(0);
		/** @type {Record<string, { x: number, y: number }>} */
		const pos = {};
		const heightOf = (it) => sizes.get(it.key)?.h ?? 110;
		const queue = items.slice();
		while (queue.length) {
			let pick = 0;
			if (!queue[0].header && cols > 1) {
				// the lowest column, and how far it is below the next-lowest one
				const sorted = [...level].sort((a, b) => a - b);
				const d = sorted[1] - sorted[0];
				if (d > 8) {
					let best = Infinity;
					for (let i = 0; i < Math.min(lookahead, queue.length) && !queue[i].header; i++) {
						// closest height to the gap wins; later bubbles pay a small penalty
						const score = Math.abs(heightOf(queue[i]) + gap - d) + i * 14;
						if (score < best) {
							best = score;
							pick = i;
						}
					}
				}
			}
			const it = queue.splice(pick, 1)[0];
			if (it.header) {
				const y = Math.max(...level);
				pos[it.key] = { x: 0, y };
				level.fill(y + (sizes.get(it.key)?.h ?? 34) + 2);
				continue;
			}
			let c = 0;
			for (let i = 1; i < cols; i++) if (level[i] < level[c] - 0.5) c = i;
			pos[it.key] = { x: Math.round(c * step), y: level[c] };
			level[c] += heightOf(it) + gap;
		}
		return { pos, height: Math.max(0, Math.max(...level) - gap) };
	});

	// no slide-in from the corner on first paint
	$effect(() => {
		if (width > 0 && !ready) requestAnimationFrame(() => requestAnimationFrame(() => (ready = true)));
	});
</script>

<div class="board" bind:clientWidth={width} style:height="{layout.height}px">
	{#each items as it (it.key)}
		{@const p = layout.pos[it.key]}
		<div
			class="cell"
			class:ready
			class:measured={!!p && sizes.has(it.key)}
			class:header={it.header}
			style:max-width={it.header ? 'none' : `${cap}px`}
			style:width={it.header ? `${width}px` : undefined}
			style:transform="translate({p?.x ?? 0}px, {p?.y ?? 0}px)"
			use:measure={it.key}
		>
			{#if it.header}
				{@render header?.(it.data)}
			{:else}
				{@render item(it.data)}
			{/if}
		</div>
	{/each}
</div>

<style>
	.board {
		position: relative;
		width: 100%;
	}
	.cell {
		position: absolute;
		top: 0;
		left: 0;
		width: max-content;
		opacity: 0;
		will-change: transform;
	}
	.cell.measured {
		opacity: 1;
	}
	.cell.ready {
		transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease;
	}
</style>
