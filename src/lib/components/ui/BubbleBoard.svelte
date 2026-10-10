<script>
	/**
	 * Packs bubbles of any size as densely as possible without changing their size.
	 *
	 * - every cell is measured at its natural size (`max-content`, capped at `maxBubble` and the
	 *   container) with a ResizeObserver, so content changes re-layout by themselves
	 * - MaxRects packing: ALL free rectangles are tracked (not just the skyline), so the hole
	 *   beside or under a short bubble can still be filled by a later one
	 * - each step looks `lookahead` bubbles ahead and takes the (bubble, spot) pair that sits
	 *   highest on the page and wastes the least width, so the board still reads roughly
	 *   newest-first
	 * - a `header` item spans the full width; free space above it is closed off
	 * - the packed block is centred and cells slide to their new place when anything changes
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
	let { items, gap = 12, maxBubble = 440, minBubble = 300, lookahead = 14, item, header } = $props();

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

	/** cut `P` out of every free rectangle it touches, then drop rectangles contained in another */
	function carve(free, P) {
		const out = [];
		for (const F of free) {
			if (P.x >= F.x + F.w || P.x + P.w <= F.x || P.y >= F.y + F.h || P.y + P.h <= F.y) {
				out.push(F);
				continue;
			}
			if (P.x > F.x) out.push({ x: F.x, y: F.y, w: P.x - F.x, h: F.h });
			if (P.x + P.w < F.x + F.w) out.push({ x: P.x + P.w, y: F.y, w: F.x + F.w - (P.x + P.w), h: F.h });
			if (P.y > F.y) out.push({ x: F.x, y: F.y, w: F.w, h: P.y - F.y });
			if (P.y + P.h < F.y + F.h) out.push({ x: F.x, y: P.y + P.h, w: F.w, h: F.y + F.h - (P.y + P.h) });
		}
		// too small for any bubble to ever use
		const useful = out.filter((F) => F.w >= 150 && F.h >= 70);
		return useful.filter((a, i) => !useful.some((b, j) => i !== j && b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h && (i > j || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
	}

	const OPEN = 1e9;

	const layout = $derived.by(() => {
		version;
		const W = width;
		if (W <= 0) return { pos: {}, height: 0 };
		const G = W + gap; // gap-inflated width: the last bubble in a row needs no special case
		let free = [{ x: 0, y: 0, w: G, h: OPEN }];
		let bottom = 0; // lowest edge of anything placed
		/** @type {Record<string, { x: number, y: number }>} */
		const pos = {};
		const dims = (it) => {
			const s = sizes.get(it.key);
			return { w: Math.min(s?.w ?? 320, cap) + gap, h: (s?.h ?? 110) + gap };
		};
		const queue = items.slice();
		let right = 0;
		while (queue.length) {
			const head = queue[0];
			if (head.header) {
				queue.shift();
				const h = (sizes.get(head.key)?.h ?? 34) + 2;
				pos[head.key] = { x: 0, y: bottom };
				bottom += h;
				free = [{ x: 0, y: bottom, w: G, h: OPEN }];
				continue;
			}
			// best (bubble, spot) among the next few bubbles: highest spot first, then the snuggest fit
			let best = null;
			for (let i = 0; i < Math.min(lookahead, queue.length) && !queue[i].header; i++) {
				const d = dims(queue[i]);
				for (const F of free) {
					if (F.w < d.w - 0.5 || F.h < d.h - 0.5) continue;
					// leftover width in this spot (capped: a big hole is not "more wasteful" than a medium one)
					const slackX = Math.min(F.w - d.w, 90);
					const slackY = F.h >= OPEN ? 0 : Math.min(F.h - d.h, 60);
					const score = F.y + 0.55 * slackX + 0.35 * slackY + i * 9;
					if (!best || score < best.score) best = { i, F, d, score };
				}
			}
			if (!best) {
				// nothing fits anywhere (cannot normally happen): drop it on the bottom row
				const it = queue.shift();
				pos[it.key] = { x: 0, y: bottom };
				bottom += dims(it).h;
				free = [{ x: 0, y: bottom, w: G, h: OPEN }];
				continue;
			}
			const it = queue.splice(best.i, 1)[0];
			const P = { x: best.F.x, y: best.F.y, w: best.d.w, h: best.d.h };
			pos[it.key] = { x: P.x, y: P.y };
			right = Math.max(right, P.x + P.w - gap);
			bottom = Math.max(bottom, P.y + P.h);
			free = carve(free, P);
		}
		// centre the packed block (headers stay full width)
		const shift = Math.max(0, Math.floor((W - right) / 2));
		for (const it of items) if (!it.header && pos[it.key]) pos[it.key].x += shift;
		return { pos, height: Math.max(0, bottom - gap) };
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
