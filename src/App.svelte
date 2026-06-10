<script lang="ts">
	import Folder from './lib/Folder.svelte'
	import FileDrop from './lib/FileDrop.svelte'
	import {
		loadEeprom,
		parsed,
		isLoaded,
		canUndo,
		canRedo,
		undo,
		redo,
		downloadBin,
		dirty,
		filename,
		tryRestore,
		clearPersisted,
	} from './state/eeprom.svelte'

	let restored = $state(false)
	let restoreAttempted = $state(false)

	// Try to restore from localStorage on first load.
	$effect(() => {
		if (restoreAttempted) return
		restoreAttempted = true
		tryRestore().then((ok) => { restored = ok })
	})

	const handleFile = (bufferPromise: Promise<ArrayBuffer>) => {
		bufferPromise.then((buf) => loadEeprom(buf, 'eeprom.bin'))
	}

	// Keyboard shortcuts: ⌘Z undo, ⌘⇧Z redo
	const onkeydown = (e: KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
			e.preventDefault()
			if (e.shiftKey) redo()
			else undo()
		}
	}
</script>

<svelte:window {onkeydown} />

{#if !isLoaded()}
	<FileDrop onfile={handleFile} />
{:else}
	<header>
		<span class="filename">{filename() || '(untitled)'}{#if dirty()}<span class="dirt">*</span>{/if}</span>
		<button onclick={undo} disabled={!canUndo()}>↶ Undo</button>
		<button onclick={redo} disabled={!canRedo()}>↷ Redo</button>
		<button onclick={downloadBin}>💾 Save .bin</button>
		<button onclick={() => { clearPersisted(); location.reload() }}>↺ Reset</button>
	</header>

	{#if parsed()}
		<Folder data={parsed() as unknown as Record<string, unknown>} />
	{/if}
{/if}

<style>
	header {
		display: flex;
		gap: 0.6em;
		align-items: center;
		padding: 0.5em 0.8em;
		background: #f4f4f4;
		border-bottom: 1px solid #ddd;
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.filename {
		font-weight: bold;
		margin-right: auto;
	}
	.dirt {
		color: #c33;
		font-weight: bold;
	}
	button {
		padding: 0.3em 0.8em;
		cursor: pointer;
		background: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-family: inherit;
	}
	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
