<script lang="ts">
	import Sprite from '../lib/Sprite.svelte'
	import SpriteEditor from '../lib/SpriteEditor.svelte'
	import { parsed, setField } from '../state/eeprom.svelte'

	interface SpriteVal {
		data: Uint8Array
		_width: number
		_height: number
		_type: 'sprite'
	}
	type Found = {
		path: (string | number)[]
		group: string         // top-level path segment ("sprites", "currentRoute", …)
		label: string         // human-readable name
		sprite: SpriteVal
	}

	const findSprites = (
		node: unknown,
		path: (string | number)[] = [],
		out: Found[] = [],
	): Found[] => {
		if (node == null || typeof node !== 'object') return out
		const rec = node as Record<string, unknown>
		if (rec._type === 'sprite') {
			const group = String(path[0] ?? '?')
			const label = path.slice(1).map(String).join('.')
			out.push({ path, group, label, sprite: rec as unknown as SpriteVal })
			return out
		}
		if (Array.isArray(node)) {
			for (let i = 0; i < node.length; i++) findSprites(node[i], [...path, i], out)
		} else {
			for (const k of Object.keys(rec)) findSprites(rec[k], [...path, k], out)
		}
		return out
	}

	const sprites = $derived(parsed() == null ? [] : findSprites(parsed()))

	const groups = $derived.by(() => {
		const m = new Map<string, Found[]>()
		for (const s of sprites) {
			if (!m.has(s.group)) m.set(s.group, [])
			m.get(s.group)!.push(s)
		}
		return [...m.entries()]
	})

	let editing = $state<Found | null>(null)
	let filter = $state('')

	const filterMatch = (s: Found): boolean => {
		const q = filter.trim().toLowerCase()
		if (!q) return true
		return s.label.toLowerCase().includes(q) || s.group.toLowerCase().includes(q)
	}

	// Each thumb is bounded to a 64px square; compute the largest integer
	// pixel scale that keeps the sprite inside that cell so pixel art stays
	// crisp regardless of sprite size.
	const cellSize = 64
	const scaleFor = (s: SpriteVal): number => {
		const sx = Math.floor(cellSize / s._width)
		const sy = Math.floor(cellSize / s._height)
		return Math.max(1, Math.min(sx, sy))
	}
</script>

{#if !parsed()}
	<p>Load an EEPROM dump to see sprites.</p>
{:else}
	{#if editing}
		<section class="editor-panel">
			<h2>Editing: {editing.group} › {editing.label}</h2>
			<SpriteEditor
				sprite={editing.sprite}
				baseName={editing.path.map(String).join('_')}
				onApply={(next) => {
					setField(editing!.path, next, `edit sprite ${editing!.path.join('.')}`)
					editing = null
				}}
				onClose={() => editing = null}
			/>
		</section>
	{/if}

	<section>
		<div class="toolbar">
			<input type="search" placeholder="filter…" bind:value={filter} />
			<span class="count">{sprites.filter(filterMatch).length} / {sprites.length} sprites</span>
		</div>

		{#each groups as [group, items] (group)}
			{@const visible = items.filter(filterMatch)}
			{#if visible.length > 0}
				<h2>{group} ({visible.length})</h2>
				<div class="grid">
					{#each visible as item (item.path.join('.'))}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="card"
							role="button"
							tabindex="0"
							class:active={editing?.path.join('.') === item.path.join('.')}
							onclick={() => editing = item}
							title={`${item.sprite._width} × ${item.sprite._height} — click to edit`}
						>
							<div class="thumb" style:width={`${cellSize}px`} style:height={`${cellSize}px`}>
								<Sprite
									data={item.sprite.data.buffer}
									width={item.sprite._width}
									height={item.sprite._height}
									scale={scaleFor(item.sprite)}
								/>
							</div>
							<div class="name">{item.label}</div>
							<div class="dim">{item.sprite._width}×{item.sprite._height}</div>
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	</section>
{/if}

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 1em 0 0.5em; font-size: 1em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
		font-family: ui-monospace, monospace;
	}
	.editor-panel {
		background: #f5fbf5;
		border: 1px solid #6a8;
		border-radius: 6px;
		padding: 0.7em;
		margin-bottom: 1em;
	}
	.editor-panel h2 { border-bottom-color: #b8d8b8; margin-top: 0; }
	.toolbar {
		display: flex; align-items: center; gap: 1em;
		margin-bottom: 0.5em;
	}
	.toolbar input {
		padding: 0.3em 0.6em; border: 1px solid #ccc; border-radius: 3px;
		font-family: inherit; width: 16em;
	}
	.count { color: #666; font-size: 0.85em; }

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 0.5em;
	}
	.card {
		display: flex; flex-direction: column; align-items: center;
		gap: 0.2em;
		padding: 0.4em 0.3em;
		background: #fafafa; border: 1px solid #eee; border-radius: 4px;
		cursor: pointer;
		min-width: 0;
	}
	.card:hover { border-color: #4477aa; background: #f0f6ff; }
	.card.active { border-color: #6a8; background: #f0fdf0; }
	.thumb {
		display: flex; align-items: center; justify-content: center;
		background:
			linear-gradient(45deg, #f0f0f0 25%, transparent 25%) 0 0/8px 8px,
			linear-gradient(45deg, transparent 75%, #f0f0f0 75%) 4px 4px/8px 8px,
			#fff;
	}
	.thumb :global(canvas) {
		image-rendering: pixelated;
		max-width: 100%;
		max-height: 100%;
	}
	.name {
		font-family: ui-monospace, monospace;
		font-size: 0.7em;
		color: #444;
		text-align: center;
		word-break: break-all;
		line-height: 1.2;
		max-width: 100%;
	}
	.dim {
		color: #999;
		font-size: 0.65em;
		font-family: ui-monospace, monospace;
	}
</style>
