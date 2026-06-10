<script lang="ts">
	import { rawBytes, filename, diffBuffers } from '../state/eeprom.svelte'
	import { parseImport } from '../pokewalker/json-import'

	// Loaded "other" dump — does NOT replace the working state. Lives in the
	// tab's local state only; navigating away discards it.
	let otherBytes = $state<Uint8Array | null>(null)
	let otherName = $state<string>('')
	let loadError = $state<string | null>(null)
	let swapSides = $state(false)

	const loadFile = async (file: File) => {
		loadError = null
		try {
			if (file.name.endsWith('.json')) {
				const text = await file.text()
				const result = parseImport(text)
				if (!result.ok) { loadError = result.error; return }
				otherBytes = result.bytes
				otherName = result.filename || file.name
			} else {
				const buf = await file.arrayBuffer()
				const u8 = new Uint8Array(0x10000)
				u8.fill(0xff)
				u8.set(new Uint8Array(buf).subarray(0, 0x10000))
				otherBytes = u8
				otherName = file.name
			}
		} catch (e) {
			loadError = String(e)
		}
	}

	const onFilePick = (e: Event) => {
		const file = (e.target as HTMLInputElement).files?.[0]
		if (file) loadFile(file)
	}

	const onDrop = (e: DragEvent) => {
		e.preventDefault()
		const file = e.dataTransfer?.files?.[0]
		if (file) loadFile(file)
	}

	const clear = () => { otherBytes = null; otherName = '' }

	const diff = $derived.by(() => {
		const cur = rawBytes()
		if (!cur || !otherBytes) return []
		const [a, b] = swapSides ? [otherBytes, cur] : [cur, otherBytes]
		return diffBuffers(a, b)
	})

	const leftLabel = $derived(swapSides ? (otherName || 'other') : (filename() || 'current'))
	const rightLabel = $derived(swapSides ? (filename() || 'current') : (otherName || 'other'))

	const formatValue = (v: unknown): string => {
		if (v == null) return '∅'
		if (typeof v === 'number') {
			if (v >= 0x100) return `${v} (0x${v.toString(16).toUpperCase()})`
			return String(v)
		}
		if (typeof v === 'string') return JSON.stringify(v)
		if (v instanceof Uint8Array) {
			const head = Array.from(v.slice(0, 8))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join(' ')
			return v.length <= 8 ? head : `${head} … (${v.length} B)`
		}
		const r = v as Record<string, unknown>
		if (r._type === 'pokestring') return JSON.stringify(r._data)
		if (r._type === 'enum') return `${r._annotate} (${r._data})`
		if (r._type === 'sprite') return `sprite ${r._width}×${r._height}`
		return JSON.stringify(v)
	}

	const formatPath = (path: (string | number)[]): string => path.join(' › ')
</script>

{#if !rawBytes()}
	<p>Load an EEPROM dump first, then a second one here to compare.</p>
{:else if !otherBytes}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="dropzone"
		ondragover={(e) => e.preventDefault()}
		ondrop={onDrop}
	>
		<p>Drop a second EEPROM image (.bin or .json) to compare against</p>
		<p class="sep">or</p>
		<input type="file" accept=".bin,.json,application/json,application/octet-stream" onchange={onFilePick} />
		{#if loadError}
			<p class="err">{loadError}</p>
		{/if}
	</div>
{:else}
	<section class="head">
		<div class="sides">
			<div class="side left">
				<span class="side-label">Left</span>
				<span class="side-name">{leftLabel}</span>
			</div>
			<button class="swap" onclick={() => swapSides = !swapSides} title="Swap left/right">⇄</button>
			<div class="side right">
				<span class="side-label">Right</span>
				<span class="side-name">{rightLabel}</span>
			</div>
		</div>
		<div class="actions">
			<button onclick={clear}>Load a different dump</button>
		</div>
	</section>

	<section>
		<h2>Differences ({diff.length})</h2>
		{#if diff.length === 0}
			<p class="empty">The two dumps are identical at every named field.</p>
		{:else}
			<div class="grid">
				<div class="hdr">Field</div>
				<div class="hdr">Offset</div>
				<div class="hdr">{leftLabel}</div>
				<div class="hdr">{rightLabel}</div>
				{#each diff as c (c.pathKey)}
					<div class="path">{formatPath(c.path)}</div>
					<div class="offset">
						0x{c.offset.toString(16).toUpperCase().padStart(4, '0')}
						{#if c.length > 1}<small>·{c.length}B</small>{/if}
					</div>
					<div class="left-val">{formatValue(c.before)}</div>
					<div class="right-val">{formatValue(c.after)}</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style>
	.dropzone {
		border: 2px dashed #aac;
		border-radius: 6px;
		padding: 2.5em 1.5em;
		text-align: center;
		color: #555;
		background: #fafbff;
	}
	.dropzone .sep { color: #aaa; margin: 0.5em 0; }
	.dropzone .err { color: #c33; margin-top: 1em; font-size: 0.9em; }

	.head {
		display: flex; align-items: center; justify-content: space-between;
		gap: 1em; flex-wrap: wrap;
		padding: 0.5em 0.7em;
		background: #f4f4f4; border-radius: 4px;
		margin-bottom: 1em;
	}
	.sides { display: flex; align-items: center; gap: 0.7em; }
	.side { display: flex; flex-direction: column; gap: 0.1em; }
	.side.right { text-align: right; }
	.side-label { color: #888; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.05em; }
	.side-name { font-family: ui-monospace, monospace; color: #222; }
	.swap {
		padding: 0.3em 0.6em; background: white; border: 1px solid #ccc;
		border-radius: 4px; cursor: pointer; font-size: 1.1em;
	}
	.actions button {
		padding: 0.3em 0.7em; background: white; border: 1px solid #ccc;
		border-radius: 4px; cursor: pointer; font-family: inherit;
	}

	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.4em 0; font-size: 1.05em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
	}
	.empty { color: #888; font-style: italic; }

	.grid {
		display: grid;
		grid-template-columns: minmax(12em, 2fr) auto minmax(8em, 1fr) minmax(8em, 1fr);
		gap: 0.3em 1em;
		align-items: baseline;
		font-size: 0.85em;
	}
	.hdr {
		color: #666; font-weight: 500;
		border-bottom: 1px solid #ddd;
		padding-bottom: 0.2em;
	}
	.path { font-family: ui-monospace, monospace; color: #222; }
	.offset { font-family: ui-monospace, monospace; color: #888; }
	.offset small { color: #aaa; }
	.left-val { font-family: ui-monospace, monospace; color: #888; white-space: pre-wrap; }
	.right-val { font-family: ui-monospace, monospace; color: #222; white-space: pre-wrap; }
</style>
