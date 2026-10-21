<script>
	/**
	 * Densest packing of cards that span 1..n columns (skyline packing).
	 *
	 * - every card is measured at the width it will get (ResizeObserver), so the layout uses real heights
	 * - each step takes the LOWEST run of equally high columns and puts there, out of the next `lookahead`
	 *   cards, the widest one that still fits the run: holes are filled instead of left behind
	 * - when nothing left fits a run (every remaining card is wider), the run is raised to its lower
	 *   neighbour so the packing can go on
	 * - cards slide to their new place when the width or any content changes
	 *
	 * @type {{
	 *   items: { key: string, span?: number, data: any }[],
	 *   gap?: number,
	 *   minCol?: number,
	 *   lookahead?: number,
	 *   item: import('svelte').Snippet<[any]>
	 * }}
	 */
	let { items, gap = 12, minCol = 330, lookahead = 16, item } = $props();

	let width = $state(0);
	let ready = $state(false);

	const cols = $derived(Math.max(1, Math.floor((width + gap) / (minCol + gap))));
	const colW = $derived(width > 0 ? (width - gap * (cols - 1)) / cols : minCol);
	const spanOf = (it) => Math.min(cols, Math.max(1, it.span || 1));
	const widthOf = (it) => spanOf(it) * colW + (spanOf(it) - 1) * gap;

	/** measured heights; a version counter tells the layout something changed */
	const sizes = new Map();
	let version = $state(0);
	let pending = false;
	function bump() {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => {
			pending = false;
			version++;
		});
	}

	/** @param {HTMLElement} node @param {string} key */
	function measure(node, key) {
		let k = key;
		const ro = new ResizeObserver(() => {
			const h = Math.ceil(node.getBoundingClientRect().height);
			if (sizes.get(k) !== h) {
				sizes.set(k, h);
				bump();
			}
		});
		ro.observe(node);
		return {
			update(next) {
				k = next;
			},
			destroy() {
				ro.disconnect();
				sizes.delete(k);
				bump();
			}
		};
	}

	const layout = $derived.by(() => {
		version;
		const h = new Array(cols).fill(0);
		const pos = {};
		const queue = items.filter((it) => sizes.has(it.key));
		while (queue.length) {
			const low = Math.min(...h);
			const c0 = h.findIndex((v) => v - low < 1);
			let run = 1;
			while (c0 + run < cols && h[c0 + run] - low < 1) run++;
			// widest card that fits the run: the next `lookahead` cards first, then the rest
			let pick = -1;
			let best = 0;
			for (const [from, to] of [[0, Math.min(queue.length, lookahead)], [lookahead, queue.length]]) {
				for (let i = from; i < to; i++) {
					const s = spanOf(queue[i]);
					if (s <= run && s > best) {
						best = s;
						pick = i;
					}
				}
				if (pick >= 0) break;
			}
			if (pick < 0) {
				// every remaining card is wider than this run: raise the run to its lower neighbour
				const lvl = Math.min(c0 > 0 ? h[c0 - 1] : Infinity, c0 + run < cols ? h[c0 + run] : Infinity);
				for (let j = 0; j < run; j++) h[c0 + j] = Number.isFinite(lvl) ? lvl : low + 1;
				continue;
			}
			const it = queue.splice(pick, 1)[0];
			const s = spanOf(it);
			pos[it.key] = { x: c0 * (colW + gap), y: low };
			for (let j = 0; j < s; j++) h[c0 + j] = low + sizes.get(it.key) + gap;
		}
		return { pos, height: Math.max(0, Math.max(...h) - gap) };
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
			class:placed={!!p}
			style:width="{widthOf(it)}px"
			style:transform="translate({p?.x ?? 0}px, {p?.y ?? 0}px)"
			use:measure={it.key}
		>
			{@render item(it.data)}
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
		opacity: 0;
		will-change: transform;
	}
	.cell.placed {
		opacity: 1;
	}
	.cell.ready {
		transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease;
	}
</style>
