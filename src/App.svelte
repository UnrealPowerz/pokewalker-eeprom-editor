<script lang="ts">
	import FileDrop from './lib/FileDrop.svelte'
	import {
		loadEeprom,
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
	import { currentRoute, navigate } from './state/route.svelte'
	import Identity from './tabs/Identity.svelte'
	import Route from './tabs/Route.svelte'
	import Sound from './tabs/Sound.svelte'
	import Raw from './tabs/Raw.svelte'

	// Try to restore from localStorage on first load.
	let restoreAttempted = $state(false)
	$effect(() => {
		if (restoreAttempted) return
		restoreAttempted = true
		tryRestore()
	})

	const handleFile = (bufferPromise: Promise<ArrayBuffer>) => {
		bufferPromise.then((buf) => loadEeprom(buf, 'eeprom.bin'))
	}

	// ⌘/Ctrl + Z = undo, ⌘/Ctrl + Shift + Z = redo
	const onkeydown = (e: KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
			e.preventDefault()
			if (e.shiftKey) redo()
			else undo()
		}
	}

	// The tab catalog — order here determines navbar order.
	const TABS = [
		{ id: 'identity', label: 'Identity', component: Identity },
		{ id: 'route',    label: 'Route',    component: Route },
		{ id: 'sound',    label: 'Sound',    component: Sound },
		{ id: 'raw',      label: 'Raw',      component: Raw },
	] as const

	const active = $derived(TABS.find((t) => t.id === currentRoute()) ?? TABS[0])
</script>

<svelte:window {onkeydown} />

{#if !isLoaded()}
	<FileDrop onfile={handleFile} />
{:else}
	<header>
		<span class="filename">
			{filename() || '(untitled)'}
			{#if dirty()}<span class="dirt" title="unsaved changes">*</span>{/if}
		</span>
		<nav>
			{#each TABS as tab}
				<button
					class="tab"
					class:active={active.id === tab.id}
					onclick={() => navigate(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</nav>
		<span class="spacer"></span>
		<button onclick={undo} disabled={!canUndo()} title="Undo (⌘Z)">↶</button>
		<button onclick={redo} disabled={!canRedo()} title="Redo (⇧⌘Z)">↷</button>
		<button onclick={downloadBin} title="Save current state as .bin">💾 Save</button>
		<button
			onclick={() => { clearPersisted(); location.reload() }}
			title="Drop the loaded dump and start over"
		>
			↺ Close
		</button>
	</header>

	<main>
		<active.component />
	</main>
{/if}

<style>
	header {
		display: flex;
		gap: 0.4em;
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
		min-width: 12em;
	}
	.dirt {
		color: #c33;
		font-weight: bold;
	}
	nav {
		display: flex;
		gap: 0.2em;
	}
	.spacer {
		flex: 1;
	}
	.tab {
		background: transparent;
		border: 1px solid transparent;
		border-bottom: 2px solid transparent;
		padding: 0.4em 0.9em;
		cursor: pointer;
		font-family: inherit;
	}
	.tab:hover {
		background: #ebebeb;
	}
	.tab.active {
		border-bottom-color: #4477aa;
		font-weight: bold;
	}
	header button:not(.tab) {
		padding: 0.3em 0.8em;
		cursor: pointer;
		background: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-family: inherit;
	}
	header button:not(.tab):disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	main {
		padding: 1em;
	}
</style>
