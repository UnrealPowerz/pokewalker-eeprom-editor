<script lang="ts">
	import { onDestroy } from 'svelte'
	import PianoRoll from '../lib/PianoRoll.svelte'
	import {
		parseNoteSequence, parseRaw, encodeRaw,
		DEFAULT_TEMPO, D_CONSTANT, TOK_END,
		type ParsedSequence, type RawEvent,
	} from '../pokewalker/sound'
	import { PRESETS } from '../pokewalker/sound-presets'
	import { downloadWav } from '../pokewalker/sound-export'
	import { encodeSoundShare, copyShareUrl, type SoundShare } from '../pokewalker/share-url'
	import { navigate } from '../state/route.svelte'

	interface Props {
		initial: SoundShare | null
	}
	let { initial }: Props = $props()

	const clockHz = 27000
	const volume = 0.2
	const tempoMul = 1.0
	const waveType: OscillatorType = 'square'

	// Initial events come from either the share URL or an empty sequence.
	const initialState = $derived.by(() => {
		if (!initial) return { events: [] as RawEvent[], terminator: { b0: 0, b1: TOK_END } }
		return parseRaw(initial.bytes)
	})
	let events = $state<RawEvent[]>([])
	let terminator = $state<{ b0: number; b1: number }>({ b0: 0, b1: TOK_END })
	$effect(() => {
		events = initialState.events
		terminator = initialState.terminator
	})

	let playheadIdx = $state<number | null>(null)
	let playing = $state(false)

	let audioCtx: AudioContext | null = null
	let current: { osc: OscillatorNode; gain: GainNode } | null = null
	let stopTimer: ReturnType<typeof setTimeout> | null = null
	let cursorTimeline: { idx: number; start: number; end: number }[] = []
	let cursorStartT = 0
	let cursorRaf: number | null = null

	const ensureCtx = () => {
		if (!audioCtx) {
			const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
			audioCtx = new AC()
		}
		if (audioCtx.state === 'suspended') audioCtx.resume()
		return audioCtx
	}

	const stopAll = () => {
		if (current) {
			try {
				const now = audioCtx!.currentTime
				current.gain.gain.cancelScheduledValues(now)
				current.gain.gain.setValueAtTime(0, now)
				current.osc.stop(now + 0.02)
			} catch { /* already stopped */ }
			current = null
		}
		if (stopTimer) { clearTimeout(stopTimer); stopTimer = null }
		if (cursorRaf != null) { cancelAnimationFrame(cursorRaf); cursorRaf = null }
		playheadIdx = null
		playing = false
	}

	const buildTimeline = (events: RawEvent[]) => {
		const out: { idx: number; start: number; end: number }[] = []
		let tempo = DEFAULT_TEMPO
		let t = 0
		for (let i = 0; i < events.length; i++) {
			const ev = events[i]
			if (ev.type === 'tempo') { tempo = ev.b0 || DEFAULT_TEMPO; continue }
			const durSec = (D_CONSTANT * ev.b0 / tempo) / clockHz / tempoMul
			out.push({ idx: i, start: t, end: t + durSec })
			t += durSec
		}
		return out
	}

	const tickCursor = () => {
		if (!audioCtx) { cursorRaf = null; return }
		const elapsed = audioCtx.currentTime - cursorStartT
		const totalDur = cursorTimeline.length > 0
			? cursorTimeline[cursorTimeline.length - 1].end
			: 0
		// Keep looping while either we haven't reached the first bar yet
		// (elapsed < 0 during the initial 50ms lead-in) or playback is
		// still within the sequence. Only when elapsed exceeds the last
		// bar's end do we tear the cursor down.
		if (elapsed >= totalDur) {
			cursorRaf = null
			playheadIdx = null
			playing = false
			return
		}
		const bar = cursorTimeline.find((b) => elapsed >= b.start && elapsed < b.end)
		playheadIdx = bar?.idx ?? null
		cursorRaf = requestAnimationFrame(tickCursor)
	}

	const playEvents = () => {
		const bytes = encodeRaw(events, terminator)
		const parsed = parseNoteSequence(bytes, clockHz)
		const ctx = ensureCtx()
		stopAll()

		const master = ctx.createGain()
		master.gain.value = volume
		master.connect(ctx.destination)

		const osc = ctx.createOscillator()
		osc.type = waveType
		const noteGain = ctx.createGain()
		noteGain.gain.value = 0
		osc.connect(noteGain)
		noteGain.connect(master)

		const t0 = ctx.currentTime + 0.05
		let t = t0
		for (const ev of parsed.events) {
			if (ev.type === 'note') {
				osc.frequency.setValueAtTime(ev.freq, t)
				noteGain.gain.setValueAtTime(1, t)
				t += ev.durationSec / tempoMul
				if (ev.gapSec > 0) {
					noteGain.gain.setValueAtTime(0, t)
					t += ev.gapSec / tempoMul
				}
			} else if (ev.type === 'rest') {
				noteGain.gain.setValueAtTime(0, t)
				t += ev.durationSec / tempoMul
			}
		}
		noteGain.gain.setValueAtTime(0, t)
		osc.start(t0)
		osc.stop(t + 0.05)

		current = { osc, gain: master }
		playing = true
		cursorTimeline = buildTimeline(events)
		cursorStartT = t0
		if (cursorRaf != null) cancelAnimationFrame(cursorRaf)
		cursorRaf = requestAnimationFrame(tickCursor)
	}

	onDestroy(stopAll)

	const loadPreset = (idx: number) => {
		const p = PRESETS[idx]
		if (!p) return
		events = p.events.map((e) => ({ ...e }))
	}

	let shareStatus = $state<string | null>(null)
	const doShare = async () => {
		const bytes = encodeRaw(events, terminator)
		const frag = encodeSoundShare({ bytes })
		const url = await copyShareUrl(frag)
		navigate(frag)
		shareStatus = `Copied: ${url}`
		setTimeout(() => { shareStatus = null }, 3000)
	}

	const doDownloadWav = () => {
		const bytes = encodeRaw(events, terminator)
		const parsed = parseNoteSequence(bytes, clockHz)
		downloadWav(parsed, waveType, volume, tempoMul, 'sound')
	}
</script>

<section>
	<h2>Sound composer</h2>
	<p class="hint">
		Standalone sound composer — no EEPROM needed. Click the grid to add notes,
		drag right-edges to resize, hit Play to preview. Share via URL to send the
		composition to someone else.
	</p>

	<div class="toolbar">
		<label>Preset
			<select onchange={(e) => loadPreset(+(e.currentTarget as HTMLSelectElement).value)}>
				<option value="-1">— pick a starting pattern —</option>
				{#each PRESETS as p, i (i)}
					<option value={i}>{p.name}</option>
				{/each}
			</select>
		</label>
		<button onclick={doShare} class="primary">⎘ Copy share URL</button>
		<button onclick={doDownloadWav}>⇩ WAV</button>
		{#if shareStatus}
			<span class="status">{shareStatus}</span>
		{/if}
	</div>

	<PianoRoll
		{events}
		onChange={(next) => { events = next }}
		onPlay={playEvents}
		onStop={stopAll}
		isPlaying={playing}
		{clockHz}
		{playheadIdx}
	/>
</section>

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.4em; font-size: 1.05em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
	}
	.hint { color: #666; font-size: 0.9em; margin: 0 0 1em; line-height: 1.4; }
	.toolbar {
		display: flex; gap: 0.7em; align-items: center; flex-wrap: wrap;
		margin-bottom: 0.7em;
	}
	.toolbar label { display: inline-flex; gap: 0.4em; align-items: center; }
	.toolbar select {
		padding: 0.3em 0.5em; border: 1px solid #ccc; border-radius: 3px;
		font-family: inherit;
	}
	.toolbar button {
		padding: 0.4em 0.8em;
		background: white; border: 1px solid #ccc; border-radius: 4px;
		font-family: inherit; cursor: pointer;
	}
	.toolbar button.primary { background: #4477aa; color: white; border-color: #335588; }
	.status { color: #4a7; font-size: 0.85em; }
</style>
