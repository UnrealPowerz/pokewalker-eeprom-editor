<script lang="ts">
	import {
		PERIOD_TABLE, DEFAULT_TEMPO,
		type RawEvent,
	} from '../pokewalker/sound'

	interface Props {
		events: RawEvent[]
		onChange: (events: RawEvent[]) => void
		onPlay: () => void
		onStop: () => void
		isPlaying: boolean
		clockHz: number
		// Index into `events` of the currently sounding bar (null when not playing).
		playheadIdx: number | null
	}
	let { events, onChange, onPlay, onStop, isPlaying, clockHz, playheadIdx }: Props = $props()

	// Layout. PX_PER_B0 is adaptive: short sequences zoom in so each note is
	// clearly clickable, long sequences zoom out so the whole composition fits
	// without horizontal scrolling. Clamped on both ends so notes never get
	// hairline-thin or absurdly wide.
	const ROW_H = 10
	const NOTE_ROWS = PERIOD_TABLE.length   // 42
	const REST_ROW = NOTE_ROWS              // row index 42
	const TOTAL_ROWS = NOTE_ROWS + 1
	const LEFT_LABELS_W = 32
	const MIN_WIDTH = 600
	const TARGET_WIDTH = 800
	const MIN_PX_PER_B0 = 0.5
	const MAX_PX_PER_B0 = 8
	const RESIZE_GRIP_W = 6
	const DEFAULT_B0 = 32

	const totalB0 = $derived(
		events.reduce((s, e) => (e.type === 'tempo' ? s : s + e.b0), 0),
	)
	const PX_PER_B0 = $derived.by(() => {
		if (totalB0 === 0) return 4
		return Math.max(MIN_PX_PER_B0, Math.min(MAX_PX_PER_B0, TARGET_WIDTH / totalB0))
	})

	type Bar = { idx: number; x: number; w: number; row: number; ev: RawEvent }

	const cumulativeBars = $derived.by<Bar[]>(() => {
		const bars: Bar[] = []
		let x = 0
		for (let i = 0; i < events.length; i++) {
			const ev = events[i]
			if (ev.type === 'tempo') continue   // shown as a flag, not a bar
			const w = ev.b0 * PX_PER_B0
			const row = ev.type === 'rest' ? REST_ROW : ev.code
			bars.push({ idx: i, x, w, row, ev })
			x += w
		}
		return bars
	})

	const totalWidth = $derived(Math.max(MIN_WIDTH, cumulativeBars.reduce((s, b) => s + b.w, 0) + 40))
	const svgHeight = TOTAL_ROWS * ROW_H + 2

	// Tempo control — exposed as a single editable value at the top. If the
	// sequence contains tempo events, we show the FIRST one and treat the
	// edit as "set initial tempo." Mid-sequence tempo changes are preserved
	// as-is.
	const initialTempoIdx = $derived(events.findIndex((e) => e.type === 'tempo'))
	const initialTempo = $derived.by(() => {
		if (initialTempoIdx === -1) return DEFAULT_TEMPO
		const e = events[initialTempoIdx]
		return e.type === 'tempo' ? (e.b0 || DEFAULT_TEMPO) : DEFAULT_TEMPO
	})

	const setInitialTempo = (val: number) => {
		const next = [...events]
		const v = Math.max(1, Math.min(255, Math.round(val)))
		if (initialTempoIdx === -1) {
			next.unshift({ type: 'tempo', b0: v })
		} else {
			next[initialTempoIdx] = { type: 'tempo', b0: v }
		}
		onChange(next)
	}

	let selectedIdx = $state<number | null>(null)
	const selectedEvent = $derived(selectedIdx == null ? null : events[selectedIdx])

	// Drag-to-resize state. The handler is bound on the SVG root so we keep
	// receiving moves even when the cursor leaves the original bar.
	let drag = $state<{ idx: number; startX: number; origB0: number } | null>(null)

	const svgX = (e: PointerEvent, svg: SVGSVGElement): { x: number; y: number } => {
		const pt = svg.createSVGPoint()
		pt.x = e.clientX
		pt.y = e.clientY
		const ctm = svg.getScreenCTM()
		if (!ctm) return { x: 0, y: 0 }
		const local = pt.matrixTransform(ctm.inverse())
		return { x: local.x, y: local.y }
	}

	const onGridDown = (e: PointerEvent) => {
		const svg = e.currentTarget as SVGSVGElement
		const { x, y } = svgX(e, svg)
		const gridX = x - LEFT_LABELS_W
		if (gridX < 0) return

		// Did we hit a bar?
		const hit = cumulativeBars.find((b) =>
			gridX >= b.x && gridX <= b.x + b.w
			&& y >= b.row * ROW_H && y < (b.row + 1) * ROW_H,
		)
		if (hit) {
			// Right-edge grip → start resize.
			if (gridX >= hit.x + hit.w - RESIZE_GRIP_W) {
				drag = { idx: hit.idx, startX: gridX, origB0: hit.ev.b0 }
				svg.setPointerCapture(e.pointerId)
				selectedIdx = hit.idx
			} else {
				selectedIdx = selectedIdx === hit.idx ? null : hit.idx
			}
			return
		}

		// Click on empty cell → insert at nearest boundary on this row.
		const row = Math.floor(y / ROW_H)
		if (row < 0 || row > REST_ROW) return

		// Find the insertion index — the bar whose START is closest to gridX.
		let insertIdx = events.length
		let bestDist = Infinity
		let cum = 0
		let evIdx = 0
		for (const ev of events) {
			if (ev.type !== 'tempo') {
				const d = Math.abs(cum - gridX)
				if (d < bestDist) { bestDist = d; insertIdx = evIdx }
				cum += ev.b0 * PX_PER_B0
			}
			evIdx++
		}
		// Also consider "after the last bar".
		if (Math.abs(cum - gridX) < bestDist) insertIdx = events.length

		const newEv: RawEvent = row === REST_ROW
			? { type: 'rest', b0: DEFAULT_B0 }
			: { type: 'note', code: row, b0: DEFAULT_B0, tied: false }
		const next = [...events]
		next.splice(insertIdx, 0, newEv)
		onChange(next)
		selectedIdx = insertIdx
	}

	const onGridMove = (e: PointerEvent) => {
		if (!drag) return
		const svg = e.currentTarget as SVGSVGElement
		const { x } = svgX(e, svg)
		const gridX = x - LEFT_LABELS_W
		const delta = (gridX - drag.startX) / PX_PER_B0
		const newB0 = Math.max(1, Math.min(255, Math.round(drag.origB0 + delta)))
		const next = [...events]
		const ev = next[drag.idx]
		if (ev.type === 'note') next[drag.idx] = { ...ev, b0: newB0 }
		else if (ev.type === 'rest') next[drag.idx] = { ...ev, b0: newB0 }
		onChange(next)
	}

	const onGridUp = (e: PointerEvent) => {
		if (drag) {
			(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
			drag = null
		}
	}

	const deleteSelected = () => {
		if (selectedIdx == null) return
		const next = events.filter((_, i) => i !== selectedIdx)
		onChange(next)
		selectedIdx = null
	}

	const toggleTied = () => {
		if (selectedIdx == null) return
		const ev = events[selectedIdx]
		if (ev.type !== 'note') return
		const next = [...events]
		next[selectedIdx] = { ...ev, tied: !ev.tied }
		onChange(next)
	}

	const setSelectedB0 = (v: number) => {
		if (selectedIdx == null) return
		const ev = events[selectedIdx]
		if (ev.type === 'tempo') return
		const b0 = Math.max(1, Math.min(255, Math.round(v)))
		const next = [...events]
		if (ev.type === 'note') next[selectedIdx] = { ...ev, b0 }
		else next[selectedIdx] = { ...ev, b0 }
		onChange(next)
	}

	const onkey = (e: KeyboardEvent) => {
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedIdx != null) {
				e.preventDefault()
				deleteSelected()
			}
		} else if (e.key === 'Escape') {
			selectedIdx = null
		}
	}

	const noteLabel = (code: number): string => {
		// 12-tone chromatic, labelled by octave-from-bottom. Code 41 = lowest.
		const octave = Math.floor((41 - code) / 12)
		const semitone = (41 - code) % 12
		const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
		return `${NAMES[semitone]}${octave}`
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="composer" onkeydown={onkey} tabindex="0" role="application">
	<div class="toolbar">
		<button onclick={isPlaying ? onStop : onPlay} class:playing={isPlaying}>
			{isPlaying ? '⏹ Stop' : '▶ Play'}
		</button>
		<label>Tempo
			<input
				type="number"
				min="1" max="255" step="1"
				value={initialTempo}
				onchange={(e) => setInitialTempo(+(e.currentTarget as HTMLInputElement).value)}
			/>
		</label>
		<span class="sep"></span>
		{#if selectedEvent}
			<span class="selected">
				selected: {selectedEvent.type}{#if selectedEvent.type === 'note'} {noteLabel(selectedEvent.code)}{/if}
			</span>
			<label>Duration
				<input
					type="number"
					min="1" max="255" step="1"
					value={selectedEvent.type === 'tempo' ? selectedEvent.b0 : selectedEvent.b0}
					onchange={(e) => setSelectedB0(+(e.currentTarget as HTMLInputElement).value)}
				/>
			</label>
			{#if selectedEvent.type === 'note'}
				<label>
					<input type="checkbox" checked={selectedEvent.tied} onchange={toggleTied} />
					Tied
				</label>
			{/if}
			<button onclick={deleteSelected}>Delete</button>
		{:else}
			<span class="hint">Click an empty cell to add. Click a bar to select. Drag right edge to resize.</span>
		{/if}
	</div>

	<div class="scroll">
		<svg
			role="application"
			aria-label="Piano roll editor"
			width={totalWidth}
			height={svgHeight}
			onpointerdown={onGridDown}
			onpointermove={onGridMove}
			onpointerup={onGridUp}
			onpointercancel={onGridUp}
		>
			<!-- row backgrounds (alternating for every 12-note octave) -->
			{#each Array(TOTAL_ROWS) as _, row}
				<rect
					x={0} y={row * ROW_H} width={totalWidth} height={ROW_H}
					fill={row === REST_ROW ? '#e8e8e8' : (Math.floor((41 - row) / 12) % 2 === 0 ? '#f7f7f7' : '#fff')}
				/>
				<line x1={LEFT_LABELS_W} x2={totalWidth} y1={row * ROW_H} y2={row * ROW_H} stroke="#eee" />
				<text
					x={2} y={row * ROW_H + 8}
					font-size="8" fill="#888" font-family="ui-monospace, monospace"
				>
					{row === REST_ROW ? 'REST' : noteLabel(row)}
				</text>
			{/each}

			<!-- bars -->
			{#each cumulativeBars as bar (bar.idx)}
				{@const playing = playheadIdx === bar.idx}
				<rect
					x={LEFT_LABELS_W + bar.x}
					y={bar.row * ROW_H + 1}
					width={Math.max(2, bar.w - 1)}
					height={ROW_H - 2}
					fill={
						playing
							? (bar.ev.type === 'rest' ? '#888' : '#ffaa33')
							: bar.ev.type === 'rest'
								? '#bbb'
								: (bar.ev.type === 'note' && bar.ev.tied ? '#4477aa' : '#5a8bbf')
					}
					stroke={selectedIdx === bar.idx ? '#c33' : (playing ? '#cc6600' : 'none')}
					stroke-width={selectedIdx === bar.idx || playing ? 2 : 0}
					cursor="pointer"
				/>
			{/each}
		</svg>
	</div>
</div>

<style>
	.composer {
		display: flex; flex-direction: column; gap: 0.5em;
		outline: none;
	}
	.toolbar {
		display: flex; gap: 0.7em; align-items: center; flex-wrap: wrap;
		padding: 0.4em 0.6em; background: #f4f4f4; border-radius: 4px;
		font-size: 0.9em;
	}
	.toolbar input[type="number"] { width: 4.5em; font-family: ui-monospace, monospace; }
	.toolbar label { display: inline-flex; align-items: center; gap: 0.3em; }
	.toolbar button {
		padding: 0.3em 0.7em; background: white; border: 1px solid #ccc;
		border-radius: 4px; cursor: pointer; font-family: inherit;
	}
	.toolbar button.playing { background: #cfe6cf; border-color: #6a8; }
	.sep { width: 1px; height: 1.2em; background: #ccc; }
	.selected { color: #c33; font-weight: bold; }
	.hint { color: #666; font-size: 0.85em; }
	.scroll {
		overflow-x: auto;
		max-width: 100%;
		border: 1px solid #ddd;
		border-radius: 4px;
	}
	svg { display: block; }
</style>
