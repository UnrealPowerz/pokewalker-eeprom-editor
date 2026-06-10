<script lang="ts">
	import { onDestroy } from 'svelte'
	import PianoRoll from '../lib/PianoRoll.svelte'
	import {
		parseNoteSequence, readDirectory, parseRaw, encodeRaw, repackPool,
		DEFAULT_TEMPO, D_CONSTANT,
		DIRECTORY_OFFSET, POOL_OFFSET, POOL_SIZE,
		type ParsedSequence, type SoundEntry, type RawEvent,
	} from '../pokewalker/sound'
	import { rawBytes, setBytes } from '../state/eeprom.svelte'
	import { PRESETS } from '../pokewalker/sound-presets'
	import { downloadWav } from '../pokewalker/sound-export'

	let clockHz = $state(27000)
	let volume = $state(0.2)
	let tempoMul = $state(1.0)
	const waveType: OscillatorType = 'square'
	let playingIdx = $state<number | null>(null)

	// Per-entry editor state. `editingIdx` is the directory index of the
	// entry being edited; `draftEvents` / `draftTerminator` hold the
	// in-progress sequence (resets on Cancel, flushes on Apply).
	let editingIdx = $state<number | null>(null)
	let draftEvents = $state<RawEvent[]>([])
	let draftTerminator = $state<{ b0: number; b1: number } | null>(null)
	let applyError = $state<string | null>(null)
	// Index into `draftEvents` of the currently sounding bar during playback.
	let playheadIdx = $state<number | null>(null)
	// Per-event time windows for the draft playback, plus the audioCtx time
	// at which the schedule began. Used by the rAF cursor loop.
	let cursorTimeline: { idx: number; start: number; end: number }[] = []
	let cursorStartT = 0
	let cursorRaf: number | null = null

	const entries = $derived.by<SoundEntry[]>(() => {
		const bytes = rawBytes()
		if (!bytes) return []
		return readDirectory(bytes)
	})

	const parsedFor = (entry: SoundEntry): ParsedSequence | null => {
		if (!entry.valid) return null
		return parseNoteSequence(entry.data, clockHz)
	}

	// Web Audio plumbing — single shared context, one active oscillator at a time.
	let audioCtx: AudioContext | null = null
	let current: { osc: OscillatorNode; gain: GainNode } | null = null
	let stopTimer: ReturnType<typeof setTimeout> | null = null

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
		playingIdx = null
	}

	// Build per-(non-tempo)-event time windows in wall-clock seconds, matching
	// what playParsed will schedule. Used to drive the playback cursor.
	const buildDraftTimeline = (events: RawEvent[]) => {
		const out: { idx: number; start: number; end: number }[] = []
		let tempo = DEFAULT_TEMPO
		let t = 0
		for (let i = 0; i < events.length; i++) {
			const ev = events[i]
			if (ev.type === 'tempo') {
				tempo = ev.b0 || DEFAULT_TEMPO
				continue
			}
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
		// Keep looping during the 50ms pre-roll (elapsed < 0) and through
		// any inter-bar gaps. Only stop once we've passed the last bar's end.
		if (elapsed >= totalDur) {
			cursorRaf = null
			playheadIdx = null
			return
		}
		const bar = cursorTimeline.find((b) => elapsed >= b.start && elapsed < b.end)
		playheadIdx = bar?.idx ?? null
		cursorRaf = requestAnimationFrame(tickCursor)
	}

	const playParsed = (idx: number, parsed: ParsedSequence) => {
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
		playingIdx = idx
		stopTimer = setTimeout(() => {
			if (playingIdx === idx) playingIdx = null
			current = null
		}, (t - ctx.currentTime + 0.1) * 1000)
	}

	const playDraft = () => {
		if (editingIdx == null) return
		const draftBytes = encodeRaw(draftEvents, draftTerminator ?? undefined)
		const parsed = parseNoteSequence(draftBytes, clockHz)
		playParsed(editingIdx, parsed)
		// Start the cursor — must run after playParsed so audioCtx exists.
		if (audioCtx) {
			cursorTimeline = buildDraftTimeline(draftEvents)
			cursorStartT = audioCtx.currentTime + 0.05  // matches playParsed's t0
			if (cursorRaf != null) cancelAnimationFrame(cursorRaf)
			cursorRaf = requestAnimationFrame(tickCursor)
		}
	}

	onDestroy(stopAll)

	const startEdit = (entry: SoundEntry) => {
		stopAll()
		const { events, terminator } = parseRaw(entry.data)
		draftEvents = events
		draftTerminator = terminator
		editingIdx = entry.index
		applyError = null
	}

	const cancelEdit = () => {
		stopAll()
		editingIdx = null
		draftEvents = []
		draftTerminator = null
		applyError = null
	}

	const applyEdit = () => {
		if (editingIdx == null) return
		const bytes = rawBytes()
		if (!bytes) return
		const newData = encodeRaw(draftEvents, draftTerminator ?? undefined)
		if (newData.length > 0xC0) {
			applyError = `Sequence is ${newData.length} bytes; walker rejects entries longer than 0xC0 (192).`
			return
		}
		const current = readDirectory(bytes)
		current[editingIdx] = { ...current[editingIdx], data: newData, length: newData.length }
		const repacked = repackPool(bytes, current)
		if (!repacked) {
			applyError = `Sound pool overflow — total of all 16 entries would exceed ${POOL_SIZE} bytes.`
			return
		}
		const sliceStart = DIRECTORY_OFFSET
		const sliceEnd = POOL_OFFSET + POOL_SIZE
		setBytes(sliceStart, repacked.subarray(sliceStart, sliceEnd), `edit sound #${editingIdx}`)
		cancelEdit()
	}

	const loadPreset = (presetIdx: number) => {
		const p = PRESETS[presetIdx]
		if (!p) return
		draftEvents = p.events.map((e) => ({ ...e }))
		// Keep the existing terminator — its b0 doesn't affect playback.
	}

	const hex = (data: Uint8Array): string =>
		Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join(' ')
</script>

<section class="controls">
	<label>Clock (Hz)
		<input type="number" bind:value={clockHz} step="1000" min="1000" />
	</label>
	<label>Volume
		<input type="range" bind:value={volume} min="0" max="1" step="0.05" />
	</label>
	<label>Tempo ×
		<input type="number" bind:value={tempoMul} step="0.1" min="0.1" max="4" />
	</label>
</section>

<p class="hint">
	Clock controls both pitch and tempo — they're linked through Timer-W.
	27000 Hz is close to the real walker; tune by ear if it sounds off.
</p>

{#if entries.length === 0}
	<p>Load an EEPROM dump to see sounds.</p>
{:else}
	<div class="entries">
		{#each entries as entry (entry.index)}
			{@const parsed = parsedFor(entry)}
			{@const isEditing = editingIdx === entry.index}
			<div class="entry" class:editing={isEditing}>
				<div class="row">
					<div class="num">#{entry.index}</div>
					<div class="info">
						<div class="meta">
							{entry.name} • offset 0x{entry.offset.toString(16)}
							(@0x{entry.dataStart.toString(16)})
							• len {entry.length}
							• chk 0x{entry.checksum.toString(16)}
						</div>
						{#if !entry.valid}
							<div class="err">length exceeds 0xC0 — walker would skip this entry</div>
						{:else if parsed}
							<div class="meta">{parsed.noteCount} notes, {parsed.events.length} events</div>
							<details>
								<summary>raw bytes ({entry.data.length})</summary>
								<pre class="raw">{hex(entry.data)}</pre>
							</details>
						{/if}
					</div>
					{#if !isEditing}
						<button
							class:playing={playingIdx === entry.index}
							disabled={!entry.valid}
							onclick={() => parsed && playParsed(entry.index, parsed)}
						>▶ Play</button>
						<button
							disabled={!entry.valid || !parsed}
							onclick={() => parsed && downloadWav(parsed, waveType, volume, tempoMul, `sound_${entry.index}_${entry.name}`)}
							title="Render and download as .wav"
						>⇩ WAV</button>
						<button disabled={!entry.valid} onclick={() => startEdit(entry)}>Edit</button>
					{:else}
						<button onclick={applyEdit} class="apply">Apply</button>
						<button onclick={cancelEdit}>Cancel</button>
					{/if}
				</div>

				{#if isEditing}
					<div class="editor">
						<div class="preset-row">
							<label>Preset
								<select onchange={(e) => loadPreset(+(e.currentTarget as HTMLSelectElement).value)}>
									<option value="-1">— pick a starting pattern —</option>
									{#each PRESETS as p, i (i)}
										<option value={i}>{p.name}</option>
									{/each}
								</select>
							</label>
							{#if applyError}<span class="err">{applyError}</span>{/if}
						</div>
						<PianoRoll
							events={draftEvents}
							onChange={(next) => { draftEvents = next; applyError = null }}
							onPlay={playDraft}
							onStop={stopAll}
							isPlaying={playingIdx === entry.index}
							{clockHz}
							{playheadIdx}
						/>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.controls {
		display: flex; gap: 1em; align-items: center; flex-wrap: wrap;
		padding: 0.8em; background: #f4f4f4; border-radius: 6px; margin-bottom: 1em;
	}
	.controls label { display: inline-flex; gap: 0.4em; align-items: center; font-size: 0.9em; }
	input[type="number"] { width: 6em; font-family: ui-monospace, monospace; }
	input[type="range"] { width: 12em; }
	.hint { color: #666; font-size: 0.85em; margin: 0.5em 0 1em; }

	.entries { display: grid; gap: 0.5em; }
	.entry {
		padding: 0.6em; background: #fafafa; border: 1px solid #eee; border-radius: 4px;
	}
	.entry.editing { border-color: #6a8; background: #f5fbf5; }
	.row { display: grid; grid-template-columns: 3em 1fr auto auto auto auto; gap: 0.8em; align-items: center; }
	.num { font-family: ui-monospace, monospace; color: #999; }
	.meta { color: #666; font-size: 0.85em; }
	.err { color: #c33; font-size: 0.85em; }
	.raw { font-family: ui-monospace, monospace; font-size: 0.78em; color: #888;
		white-space: pre-wrap; word-break: break-all; margin: 0.3em 0 0; }
	details summary { cursor: pointer; color: #888; font-size: 0.85em; }
	.row button {
		padding: 0.4em 0.9em; background: white; border: 1px solid #ccc;
		border-radius: 4px; cursor: pointer; font-family: inherit;
	}
	.row button.playing { background: #cfe6cf; border-color: #6a8; }
	.row button.apply { background: #4a7; color: white; border-color: #3a6; }
	.row button:disabled { opacity: 0.4; cursor: not-allowed; }
	.editor { margin-top: 0.7em; }
	.preset-row { display: flex; align-items: center; gap: 1em; margin-bottom: 0.5em; }
	.preset-row label { display: inline-flex; align-items: center; gap: 0.3em; font-size: 0.9em; }
</style>
