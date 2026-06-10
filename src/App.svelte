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
		downloadJson,
		loadJsonExport,
		dirty,
		filename,
		tryRestore,
		clearPersisted,
	} from './state/eeprom.svelte'
	import { currentRoute, navigate } from './state/route.svelte'
	import General from './tabs/General.svelte'
	import Route from './tabs/Route.svelte'
	import Team from './tabs/Team.svelte'
	import History from './tabs/History.svelte'
	import Peers from './tabs/Peers.svelte'
	import Gallery from './tabs/Gallery.svelte'
	import Sound from './tabs/Sound.svelte'
	import Changes from './tabs/Changes.svelte'
	import Compare from './tabs/Compare.svelte'
	import Raw from './tabs/Raw.svelte'
	import ShareSprite from './tabs/ShareSprite.svelte'
	import ShareSound from './tabs/ShareSound.svelte'
	import { decodeSpriteShare, decodeSoundShare } from './pokewalker/share-url'

	// Try to restore from localStorage on first load.
	let restoreAttempted = $state(false)
	$effect(() => {
		if (restoreAttempted) return
		restoreAttempted = true
		tryRestore()
	})

	const handleFile = async (bufferPromise: Promise<ArrayBuffer>): Promise<void> => {
		const buf = await bufferPromise
		await loadEeprom(buf, 'eeprom.bin')
	}

	let jsonInput = $state<HTMLInputElement>()
	const importJson = async (e: Event) => {
		const file = (e.target as HTMLInputElement).files?.[0]
		if (!file) return
		const text = await file.text()
		const err = await loadJsonExport(text)
		if (err) alert(`Import failed: ${err}`)
		// Reset input so picking the same file again re-triggers.
		if (jsonInput) jsonInput.value = ''
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
		{ id: 'general',  label: 'General',  component: General },
		{ id: 'route',    label: 'Route',    component: Route },
		{ id: 'team',     label: 'Team',     component: Team },
		{ id: 'history',  label: 'History',  component: History },
		{ id: 'peers',    label: 'Peers',    component: Peers },
		{ id: 'gallery',  label: 'Gallery',  component: Gallery },
		{ id: 'sound',    label: 'Sound',    component: Sound },
		{ id: 'changes',  label: 'Changes',  component: Changes },
		{ id: 'compare',  label: 'Compare',  component: Compare },
		{ id: 'raw',      label: 'Raw',      component: Raw },
	] as const

	const active = $derived(TABS.find((t) => t.id === currentRoute()) ?? TABS[0])

	// Standalone share routes work without an EEPROM. We detect them on the
	// raw route (#share/sprite/... or #share/sound/...) before falling back
	// to the normal "EEPROM loaded → tabs" flow.
	const shareSprite = $derived(decodeSpriteShare(currentRoute()))
	const shareSound = $derived(decodeSoundShare(currentRoute()))
	const inShareMode = $derived(
		currentRoute() === 'share/sprite' || currentRoute() === 'share/sound' ||
		shareSprite !== null || shareSound !== null,
	)
</script>

<svelte:window {onkeydown} />

{#if inShareMode}
	<header class="share-header">
		<span class="brand">Pokéwalker share editor</span>
		<span class="spacer"></span>
		<button onclick={() => navigate('share/sprite')} class:active={currentRoute().startsWith('share/sprite')}>Sprite</button>
		<button onclick={() => navigate('share/sound')} class:active={currentRoute().startsWith('share/sound')}>Sound</button>
		<button onclick={() => navigate('general')}>Open EEPROM →</button>
	</header>
	<main>
		{#if currentRoute().startsWith('share/sprite')}
			<ShareSprite initial={shareSprite} />
		{:else}
			<ShareSound initial={shareSound} />
		{/if}
	</main>
{:else if !isLoaded()}
	<FileDrop onfile={handleFile} />
	<div class="standalone-link">
		<p>
			Or skip the EEPROM and try a standalone editor:
			<button onclick={() => navigate('share/sprite')}>Sprite editor</button>
			<button onclick={() => navigate('share/sound')}>Sound composer</button>
		</p>
	</div>
{:else}
	<header>
		<div class="actions">
			<span class="filename">
				{filename() || '(untitled)'}
				{#if dirty()}<span class="dirt" title="unsaved changes">*</span>{/if}
			</span>
			<span class="spacer"></span>
			<button onclick={undo} disabled={!canUndo()} title="Undo (⌘Z)">↶</button>
			<button onclick={redo} disabled={!canRedo()} title="Redo (⇧⌘Z)">↷</button>
			<button onclick={downloadBin} title="Save current state as .bin">Save .bin</button>
			<button onclick={downloadJson} title="Export current state as .json">Export JSON</button>
			<button onclick={() => jsonInput?.click()} title="Replace current dump with one from a .json export">Import JSON</button>
			<input
				bind:this={jsonInput}
				type="file"
				accept=".json,application/json"
				onchange={importJson}
				style="display: none"
			/>
			<button
				onclick={() => { clearPersisted(); location.reload() }}
				title="Drop the loaded dump and start over"
			>
				↺ Close
			</button>
		</div>
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
	</header>

	<main>
		{#key active.id}
			{@const ActiveComp = active.component}
			<ActiveComp />
		{/key}
	</main>
{/if}

<style>
	header {
		display: flex;
		flex-direction: column;
		gap: 0.3em;
		padding: 0.5em 0.8em;
		background: #f4f4f4;
		border-bottom: 1px solid #ddd;
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
		align-items: center;
	}
	.filename {
		font-weight: bold;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dirt {
		color: #c33;
		font-weight: bold;
	}
	.spacer {
		flex: 1;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2em;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}
	.tab {
		background: transparent;
		border: 1px solid transparent;
		border-bottom: 2px solid transparent;
		padding: 0.5em 0.9em;
		cursor: pointer;
		font-family: inherit;
		min-height: 40px;
		white-space: nowrap;
	}
	.tab:hover {
		background: #ebebeb;
	}
	.tab.active {
		border-bottom-color: #4477aa;
		font-weight: bold;
	}
	header button:not(.tab) {
		padding: 0.4em 0.7em;
		cursor: pointer;
		background: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-family: inherit;
		min-height: 36px;
	}
	header button:not(.tab):disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	main {
		padding: 1em;
	}
	.share-header {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5em;
		padding: 0.5em 0.8em;
		background: #f4f4f4; border-bottom: 1px solid #ddd;
		position: sticky; top: 0; z-index: 10;
	}
	.share-header .brand { font-weight: bold; color: #222; }
	.share-header button {
		padding: 0.4em 0.8em;
		background: white; border: 1px solid #ccc; border-radius: 4px;
		cursor: pointer; font-family: inherit;
	}
	.share-header button.active { background: #4477aa; color: white; border-color: #335588; }
	.standalone-link {
		position: fixed; bottom: 1em; left: 0; right: 0;
		text-align: center; color: #888; font-size: 0.9em;
	}
	.standalone-link button {
		margin-left: 0.4em;
		padding: 0.3em 0.7em;
		background: white; border: 1px solid #ccc; border-radius: 4px;
		cursor: pointer; font-family: inherit;
	}
	@media (max-width: 480px) {
		main { padding: 0.5em; }
		header { padding: 0.4em 0.5em; }
	}
</style>
