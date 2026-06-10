<script lang="ts">
	import { rawBytes, getChanges, revertField } from '../state/eeprom.svelte'

	// Read rawBytes() to subscribe to byte changes — getChanges() itself is
	// a plain function, so the $derived has to depend on something reactive.
	const changes = $derived.by(() => {
		void rawBytes()
		return getChanges()
	})

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

<section>
	<h2>Changes ({changes.length})</h2>
	<p class="hint">
		Every field whose value differs from the originally-loaded dump.
		Use the revert button to undo just that field — your other edits stay
		intact. Reliable-save mirroring runs automatically on revert.
	</p>

	{#if changes.length === 0}
		<p class="empty">No changes since load.</p>
	{:else}
		<div class="grid">
			<div class="hdr">Field</div>
			<div class="hdr">Offset</div>
			<div class="hdr">Was</div>
			<div class="hdr">Now</div>
			<div class="hdr"></div>
			{#each changes as c (c.pathKey)}
				<div class="path">{formatPath(c.path)}</div>
				<div class="offset">
					0x{c.offset.toString(16).toUpperCase().padStart(4, '0')}
					{#if c.length > 1}<small>·{c.length}B</small>{/if}
				</div>
				<div class="before">{formatValue(c.before)}</div>
				<div class="after">{formatValue(c.after)}</div>
				<div>
					<button onclick={() => revertField(c.path)}>↶ Revert</button>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.4em 0; font-size: 1.05em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
	}
	.hint { color: #666; font-size: 0.85em; margin: 0 0 1em; }
	.empty { color: #888; font-style: italic; }

	.grid {
		display: grid;
		grid-template-columns: minmax(12em, 2fr) auto minmax(8em, 1fr) minmax(8em, 1fr) auto;
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
	.before { font-family: ui-monospace, monospace; color: #888; white-space: pre-wrap; }
	.after { font-family: ui-monospace, monospace; color: #222; white-space: pre-wrap; }
	button {
		padding: 0.2em 0.6em;
		background: white; border: 1px solid #ccc;
		border-radius: 3px; cursor: pointer;
		font-family: inherit; font-size: 0.85em;
	}
	button:hover { background: #f0f0f0; }
</style>
