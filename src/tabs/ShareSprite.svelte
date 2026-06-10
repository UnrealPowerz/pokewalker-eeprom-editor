<script lang="ts">
	import SpriteEditor from '../lib/SpriteEditor.svelte'
	import { encodeSpriteShare, copyShareUrl, type SpriteShare } from '../pokewalker/share-url'
	import { navigate } from '../state/route.svelte'

	interface SpriteVal {
		data: Uint8Array
		_width: number
		_height: number
		_type: 'sprite'
	}

	interface Props {
		// Initial state from the URL. If null, the user gets to pick dimensions
		// and starts with an all-color-0 buffer.
		initial: SpriteShare | null
	}
	let { initial }: Props = $props()

	// New-sprite controls — shown when there's no initial share data.
	let newW = $state(32)
	let newH = $state(32)
	const COMMON_SIZES = [
		{ w: 8, h: 8, name: 'icon' },
		{ w: 16, h: 16, name: 'small' },
		{ w: 32, h: 24, name: 'small poke' },
		{ w: 64, h: 48, name: 'large poke' },
		{ w: 80, h: 16, name: 'text banner' },
		{ w: 96, h: 16, name: 'wide banner' },
	]

	const blankSprite = (w: number, h: number): SpriteVal => ({
		data: new Uint8Array((w * h) / 4),
		_width: w,
		_height: h,
		_type: 'sprite',
	})

	const seedSprite = (s: SpriteShare | null): SpriteVal | null =>
		s ? { data: s.bytes, _width: s.width, _height: s.height, _type: 'sprite' } : null

	let sprite = $state<SpriteVal | null>(null)
	$effect(() => { sprite = seedSprite(initial) })

	let shareStatus = $state<string | null>(null)
	const doShare = async (live: SpriteVal) => {
		const frag = encodeSpriteShare({ width: live._width, height: live._height, bytes: live.data })
		const url = await copyShareUrl(frag)
		// Reflect the new state in the URL bar so refresh / back works.
		navigate(frag)
		shareStatus = `Copied: ${url}`
		setTimeout(() => { shareStatus = null }, 3000)
	}

	const startNew = (w: number, h: number) => {
		newW = w; newH = h
		sprite = blankSprite(w, h)
	}
</script>

<section>
	<h2>Sprite editor</h2>
	<p class="hint">
		Standalone sprite editor — no EEPROM needed. Edit and share the result by
		copying the URL; whoever opens it sees the same sprite ready to keep editing.
	</p>

	{#if !sprite}
		<div class="picker">
			<p>Pick a size to start:</p>
			<div class="presets">
				{#each COMMON_SIZES as s (s.name)}
					<button onclick={() => startNew(s.w, s.h)}>
						{s.w}×{s.h} <small>{s.name}</small>
					</button>
				{/each}
			</div>
			<p>Or enter custom dimensions:</p>
			<div class="custom">
				<label>Width <input type="number" bind:value={newW} min="4" max="256" step="4" /></label>
				<label>Height <input type="number" bind:value={newH} min="4" max="256" step="4" /></label>
				<button onclick={() => startNew(newW, newH)}>New blank sprite</button>
			</div>
			<p class="caveat">
				Walker sprite encoding packs 8 rows into each column page. Heights that
				aren't multiples of 8 still work but waste a few bits at the bottom of
				the last page.
			</p>
		</div>
	{:else}
		<div class="toolbar">
			<button onclick={() => sprite = null}>← Pick new size</button>
			{#if shareStatus}
				<span class="status">{shareStatus}</span>
			{/if}
		</div>

		<SpriteEditor
			{sprite}
			baseName="sprite"
			onClose={() => { sprite = null }}
			onShare={doShare}
		/>
	{/if}
</section>

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.4em; font-size: 1.05em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
	}
	.hint { color: #666; font-size: 0.9em; margin: 0 0 1em; line-height: 1.4; }

	.picker { max-width: 40em; }
	.presets { display: flex; flex-wrap: wrap; gap: 0.4em; margin: 0.5em 0; }
	.presets button {
		padding: 0.5em 0.8em;
		background: white; border: 1px solid #ccc; border-radius: 4px;
		font-family: inherit; cursor: pointer;
	}
	.presets button small { color: #888; font-size: 0.8em; margin-left: 0.3em; }
	.presets button:hover { background: #f0f6ff; border-color: #4477aa; }
	.custom { display: flex; flex-wrap: wrap; gap: 0.7em; align-items: center; margin: 0.5em 0; }
	.custom label { display: inline-flex; gap: 0.4em; align-items: center; }
	.custom input { width: 5em; padding: 0.25em 0.4em; border: 1px solid #ccc; border-radius: 3px; }
	.custom button {
		padding: 0.5em 0.9em; background: #4a7; color: white;
		border: 1px solid #3a6; border-radius: 4px; cursor: pointer;
	}
	.caveat { color: #888; font-size: 0.85em; line-height: 1.4; }

	.toolbar {
		display: flex; gap: 0.5em; align-items: center; flex-wrap: wrap;
		margin-bottom: 0.7em;
	}
	.toolbar button {
		padding: 0.4em 0.8em;
		background: white; border: 1px solid #ccc; border-radius: 4px;
		font-family: inherit; cursor: pointer;
	}
	.status { color: #4a7; font-size: 0.85em; }
</style>
