<script lang="ts">
	import { spriteDataToBitmap, colorCss } from '../pokewalker/decode-sprite'
	import { encodeSprite } from '../pokewalker/encode-sprite'
	import { exportBin, exportPng } from '../pokewalker/sprite-export'

	interface SpriteVal {
		data: Uint8Array
		_width: number
		_height: number
		_type: 'sprite'
	}

	interface Props {
		sprite: SpriteVal
		// Optional commit callback. When provided, an "Apply" button shows in
		// the toolbar and clicking it calls this with the encoded SpriteVal.
		// EEPROM contexts use this to write through setField. Standalone
		// editors leave it undefined — there's nothing to commit to.
		onApply?: (next: SpriteVal) => void
		onClose: () => void
		// Optional: show a "Share URL" button that exports the LIVE pixel
		// buffer (without needing Apply). Caller does URL encoding + clipboard.
		onShare?: (live: SpriteVal) => void
		// Optional download-filename prefix. Defaults to "sprite".
		baseName?: string
	}
	let { sprite, onApply, onClose, onShare, baseName: baseNameProp }: Props = $props()

	const width = $derived(sprite._width)
	const height = $derived(sprite._height)

	// Adaptive scale — target a canvas that fits ~400×320 with integer pixel
	// scaling, capped so tiny sprites (8×16 digits) don't blow up to wall
	// size, and floored so wide sprites (96×16 text banners) stay readable.
	const MAX_PX = 16
	const MIN_PX = 4
	const TARGET_W = 400
	const TARGET_H = 320
	let zoom = $state(1)   // user zoom multiplier on top of the auto-fit
	const autoPx = $derived(Math.max(MIN_PX, Math.min(MAX_PX, Math.floor(TARGET_W / width), Math.floor(TARGET_H / height))))
	const PX = $derived(Math.max(2, Math.round(autoPx * zoom)))

	// Local pixel buffer the editor mutates. Reset whenever the sprite prop
	// changes (e.g. switching to a different sprite from outside).
	let pixels = $state<Uint8Array>(new Uint8Array(0))
	$effect(() => {
		pixels = new Uint8Array(spriteDataToBitmap(sprite.data.buffer, width, height))
	})

	let selectedColor = $state(0)
	let painting = false
	let canvas: HTMLCanvasElement | undefined = $state()
	let dirty = $state(false)
	let hover = $state<{ x: number; y: number } | null>(null)

	// Visual order = lightest → darkest. Codes 1 and 2 are deliberately
	// flipped here so the palette reads as a gradient even though the raw
	// code values are 0 / 1 / 2 / 3 in non-monotonic shade order.
	const PALETTE = [0, 2, 1, 3]

	const draw = () => {
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		ctx.fillStyle = '#fff'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const v = pixels[y * width + x] & 3
				ctx.fillStyle = colorCss(v)
				ctx.fillRect(x * PX, y * PX, PX, PX)
			}
		}
		// Grid lines — fainter at smaller scales so they don't visually
		// dominate when the canvas is denser.
		ctx.strokeStyle = `rgba(0,0,0,${PX >= 8 ? 0.08 : 0.04})`
		ctx.lineWidth = 1
		for (let x = 0; x <= width; x++) {
			ctx.beginPath()
			ctx.moveTo(x * PX + 0.5, 0)
			ctx.lineTo(x * PX + 0.5, height * PX)
			ctx.stroke()
		}
		for (let y = 0; y <= height; y++) {
			ctx.beginPath()
			ctx.moveTo(0, y * PX + 0.5)
			ctx.lineTo(width * PX, y * PX + 0.5)
			ctx.stroke()
		}
		// Hover indicator — outlined rectangle in the active palette color so
		// you can see both which pixel will be edited AND what color it will
		// become.
		if (hover) {
			ctx.strokeStyle = colorCss(selectedColor)
			ctx.lineWidth = 2
			ctx.strokeRect(hover.x * PX + 1, hover.y * PX + 1, PX - 2, PX - 2)
			ctx.strokeStyle = 'rgba(255,255,255,0.7)'
			ctx.lineWidth = 1
			ctx.strokeRect(hover.x * PX + 0.5, hover.y * PX + 0.5, PX - 1, PX - 1)
		}
	}

	$effect(() => {
		// Re-render whenever pixels, hover, color, or canvas binding change.
		if (canvas) {
			canvas.width = width * PX
			canvas.height = height * PX
			void pixels  // dependency
			void hover
			void selectedColor
			draw()
		}
	})

	const pixelAt = (e: PointerEvent): { x: number; y: number } | null => {
		if (!canvas) return null
		const rect = canvas.getBoundingClientRect()
		// Translate display coords → sprite-pixel coords. We can't assume
		// rect.width === canvas.width: if CSS shrinks the canvas, the click
		// position has to be remapped to the canvas's buffer space first.
		const x = Math.floor(((e.clientX - rect.left) / rect.width) * width)
		const y = Math.floor(((e.clientY - rect.top) / rect.height) * height)
		if (x < 0 || y < 0 || x >= width || y >= height) return null
		return { x, y }
	}

	const paint = (e: PointerEvent) => {
		const p = pixelAt(e)
		if (!p) return
		const idx = p.y * width + p.x
		if (pixels[idx] === selectedColor) return
		const next = new Uint8Array(pixels)
		next[idx] = selectedColor
		pixels = next
		dirty = true
	}

	const onDown = (e: PointerEvent) => {
		e.preventDefault()
		canvas?.setPointerCapture(e.pointerId)
		painting = true
		paint(e)
	}

	const onMove = (e: PointerEvent) => {
		hover = pixelAt(e)
		if (!painting) return
		paint(e)
	}

	const onLeave = () => { hover = null }

	const onUp = (e: PointerEvent) => {
		if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
		painting = false
	}

	const apply = () => {
		if (!onApply) return
		const encoded = encodeSprite(pixels, width, height)
		const next: SpriteVal = { data: encoded, _width: width, _height: height, _type: 'sprite' }
		onApply(next)
		dirty = false
		// Note: Apply does NOT call onClose — callers decide whether to keep
		// the editor open (standalone share view) or close it on commit
		// (EEPROM contexts). EEPROM callers close from inside their onApply.
	}

	const fill = (color: number) => {
		const next = new Uint8Array(pixels.length).fill(color)
		pixels = next
		dirty = true
	}

	const clear = () => fill(0)

	const cancel = () => {
		// Drop in-progress edits — restore pixels to whatever the sprite prop
		// currently holds. Standalone editors stay mounted, so this is the
		// only path that reverts unsaved changes; in EEPROM contexts the
		// editor unmounts on onClose so the reset is a no-op but harmless.
		pixels = new Uint8Array(spriteDataToBitmap(sprite.data.buffer, width, height))
		dirty = false
		onClose()
	}

	const baseName = $derived(baseNameProp ?? 'sprite')

	// Re-encode the live pixel buffer for export so changes-in-progress are
	// reflected even before Apply is hit.
	const liveSprite = $derived(() => ({
		data: encodeSprite(pixels, width, height),
		width, height,
	}))

	const doExportBin = () => exportBin(liveSprite(), baseName)
	const doExportPng = () => exportPng(liveSprite(), baseName)

	const doShare = () => {
		if (!onShare) return
		const encoded = encodeSprite(pixels, width, height)
		onShare({ data: encoded, _width: width, _height: height, _type: 'sprite' })
	}
</script>

<div class="editor">
	<div class="toolbar">
		<span class="palette" role="radiogroup" aria-label="Color palette">
			{#each PALETTE as c (c)}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<span
					class="swatch"
					class:active={selectedColor === c}
					style:background={colorCss(c)}
					title={`Color ${c}`}
					role="radio"
					aria-checked={selectedColor === c}
					tabindex="0"
					onclick={() => selectedColor = c}
				>{c}</span>
			{/each}
		</span>
		<span class="dim">{width} × {height} @ {PX}px</span>
		<span class="zoom">
			<button onclick={() => zoom = Math.max(0.25, zoom / 1.5)} title="Zoom out">−</button>
			<button onclick={() => zoom = 1} title="Reset zoom">100%</button>
			<button onclick={() => zoom = Math.min(8, zoom * 1.5)} title="Zoom in">+</button>
		</span>
		<button onclick={clear} title="Fill with color 0">Clear</button>
		<button onclick={() => fill(selectedColor)} title="Fill with selected color">Fill</button>
		<span class="sep"></span>
		<button onclick={doExportPng} title="Download as PNG">⇩ PNG</button>
		<button onclick={doExportBin} title="Download raw walker-format bytes">⇩ .bin</button>
		{#if onShare}
			<button onclick={doShare} class="apply" title="Copy a share URL containing the current sprite">⎘ Share URL</button>
		{/if}
		<span class="spacer"></span>
		{#if onApply}
			<button onclick={apply} class="apply" disabled={!dirty}>Apply</button>
		{/if}
		<button onclick={cancel}>Cancel</button>
	</div>
	<div class="canvas-scroll">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<canvas
			bind:this={canvas}
			style:width={`${width * PX}px`}
			style:height={`${height * PX}px`}
			onpointerdown={onDown}
			onpointermove={onMove}
			onpointerup={onUp}
			onpointercancel={onUp}
			onpointerleave={onLeave}
		></canvas>
	</div>
</div>

<style>
	.editor {
		border: 1px solid #6a8;
		background: #f5fbf5;
		border-radius: 4px;
		padding: 0.6em;
		display: inline-flex;
		flex-direction: column;
		gap: 0.5em;
	}
	.toolbar {
		display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;
		font-size: 0.9em;
	}
	.palette { display: inline-flex; gap: 0.2em; }
	.swatch {
		width: 1.6em; height: 1.6em;
		display: inline-flex; align-items: center; justify-content: center;
		border: 2px solid transparent;
		border-radius: 3px;
		cursor: pointer;
		color: #fff;
		text-shadow: 0 0 2px rgba(0,0,0,0.6);
		font-family: ui-monospace, monospace;
		font-size: 0.8em;
		user-select: none;
	}
	.swatch.active { border-color: #c33; }
	.dim {
		color: #666; font-size: 0.85em;
		font-family: ui-monospace, monospace;
	}
	.sep { width: 1px; height: 1.2em; background: #cdc; }
	.spacer { flex: 1; }
	.zoom { display: inline-flex; gap: 0.15em; }
	.zoom button { font-family: ui-monospace, monospace; min-width: 2em; }
	.toolbar button {
		padding: 0.3em 0.7em; background: white; border: 1px solid #ccc;
		border-radius: 4px; cursor: pointer; font-family: inherit;
	}
	.toolbar button.apply { background: #4a7; color: white; border-color: #3a6; }
	.toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
	.canvas-scroll {
		overflow: auto;
		max-width: 100%;
		max-height: 70vh;
		border: 1px solid #ddd;
		background: #fff;
		align-self: flex-start;
	}
	canvas {
		display: block;
		image-rendering: pixelated;
		cursor: crosshair;
		touch-action: none;
		background: #fff;
	}
</style>
