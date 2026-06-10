<script lang="ts">
	import Folder from '../lib/Folder.svelte'
	import HexView from '../lib/HexView.svelte'
	import Expandable from '../lib/Expandable.svelte'
	import { parsed, rawBytes } from '../state/eeprom.svelte'

	const tree = $derived(parsed())
	const bytes = $derived(rawBytes())
</script>

<p class="warn">
	⚠ Raw edits bypass reliable-save mirroring and checksum recomputation —
	the walker may refuse to boot a dump edited here unless you keep things
	consistent yourself. Use the named tabs for safe editing.
</p>

{#if tree}
	<Folder data={tree as unknown as Record<string, unknown>} />
{/if}

{#if bytes}
	<div class="hex-section">
		<Expandable>
			{#snippet header()}
				<span class="hex-header">Whole EEPROM — {bytes.length} bytes</span>
			{/snippet}
			{#snippet body()}
				<HexView data={bytes.buffer as ArrayBuffer} baseOffset={0} />
			{/snippet}
		</Expandable>
	</div>
{/if}

<style>
	.warn {
		background: #fff7e8;
		border: 1px solid #f1c789;
		color: #934;
		padding: 0.5em 0.7em;
		border-radius: 4px;
		font-size: 0.9em;
		margin: 0 0 1em;
	}
	.hex-section { margin-top: 1.5em; }
	.hex-header { font-weight: bold; color: #222; }
</style>
