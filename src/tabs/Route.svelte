<script lang="ts">
	import Sprite from '../lib/Sprite.svelte'
	import AnimatedSprite from '../lib/AnimatedSprite.svelte'
	import SpriteEditor from '../lib/SpriteEditor.svelte'
	import NumberField from '../lib/fields/NumberField.svelte'
	import TextField from '../lib/fields/TextField.svelte'
	import EnumField from '../lib/fields/EnumField.svelte'
	import { parsed, setField } from '../state/eeprom.svelte'
	import { getAtPath } from '../state/path'
	import { exportGif } from '../pokewalker/sprite-export'
	import { species } from '../pokewalker/types/species'
	import { items } from '../pokewalker/types/items'
	import { moves } from '../pokewalker/types/moves'

	interface SpriteVal { data: Uint8Array; _width: number; _height: number; _type: 'sprite' }

	// Single editor instance — only one sprite is editable at a time. Picking
	// a different sprite while editing discards in-progress changes (the
	// editor's Apply must run first to persist).
	let editing = $state<{ sprite: SpriteVal; path: (string | number)[]; label: string } | null>(null)
	const openEditor = (sprite: SpriteVal | undefined, path: (string | number)[], label: string) => {
		if (!sprite) return
		editing = { sprite, path, label }
	}
	const closeEditor = () => { editing = null }

	const downloadGif = (frames: (SpriteVal | undefined)[], baseName: string) => {
		const valid = frames.filter((f): f is SpriteVal => !!f)
		if (valid.length === 0) return
		exportGif(
			valid.map((f) => ({ data: f.data, width: f._width, height: f._height })),
			baseName,
		)
	}
	interface EnumVal { _data: number; _annotate: string; _type: 'enum' }
	interface PokeStrVal { _data: string; _type: 'pokestring' }
	interface PokeSummary {
		species: EnumVal
		heldItem: EnumVal
		moves: EnumVal[]
		level: number
		variantAndFlags: number
	}

	const routePath = ['currentRoute'] as const
	const infoPath = [...routePath, 'routeInfo']

	const info = $derived(getAtPath(parsed(), infoPath) as Record<string, unknown> | undefined)
	const areaSprite = $derived(getAtPath(parsed(), [...routePath, 'areaSprite']) as SpriteVal | undefined)
	const areaNameSprite = $derived(getAtPath(parsed(), [...routePath, 'areaNameSprite']) as SpriteVal | undefined)
	const walkPokeLargeFrames = $derived.by<(SpriteVal | undefined)[]>(() => [
		getAtPath(parsed(), [...routePath, 'walkPokeAnimatedSpriteLarge', 0]) as SpriteVal | undefined,
		getAtPath(parsed(), [...routePath, 'walkPokeAnimatedSpriteLarge', 1]) as SpriteVal | undefined,
	])
	const routePokeSpriteFrames = $derived.by<(SpriteVal | undefined)[][]>(() => {
		const out: (SpriteVal | undefined)[][] = []
		for (let i = 0; i < 3; i++) {
			out.push([
				getAtPath(parsed(), [...routePath, 'routePokeSprites', i, 0]) as SpriteVal | undefined,
				getAtPath(parsed(), [...routePath, 'routePokeSprites', i, 1]) as SpriteVal | undefined,
			])
		}
		return out
	})
	const routePokeNameSprites = $derived.by<(SpriteVal | undefined)[]>(() => {
		const out: (SpriteVal | undefined)[] = []
		for (let i = 0; i < 3; i++) {
			out.push(getAtPath(parsed(), [...routePath, 'routePokeNameSprites', i]) as SpriteVal | undefined)
		}
		return out
	})
	const itemNameSprites = $derived.by<(SpriteVal | undefined)[]>(() => {
		const out: (SpriteVal | undefined)[] = []
		for (let i = 0; i < 10; i++) {
			out.push(getAtPath(parsed(), [...routePath, 'itemNameSprites', i]) as SpriteVal | undefined)
		}
		return out
	})

	const walkPoke = $derived(info?.poke as PokeSummary | undefined)
	const routeName = $derived(info?.routeName as PokeStrVal | undefined)
	const routePokes = $derived((info?.routePokes ?? []) as PokeSummary[])
	const routePokeChance = $derived((info?.routePokeChance ?? []) as number[])
	const routePokeMinSteps = $derived((info?.routePokeMinSteps ?? []) as number[])
	const routeItems = $derived((info?.routeItems ?? []) as EnumVal[])
	const routeItemChance = $derived((info?.routeItemChance ?? []) as number[])
	const routeItemMinSteps = $derived((info?.routeItemMinSteps ?? []) as number[])
</script>

{#if !info}
	<p>Load an EEPROM dump to see the current route.</p>
{:else}
	{#if editing}
		<section class="editor-panel">
			<h2>Editing: {editing.label}</h2>
			<SpriteEditor
				sprite={editing.sprite}
				baseName={editing.path.map(String).join('_')}
				onApply={(next) => {
					setField(editing!.path, next, `edit sprite ${editing!.path.join('.')}`)
					closeEditor()
				}}
				onClose={closeEditor}
			/>
		</section>
	{/if}

	<section>
		<h2>Route</h2>
		<div class="route-head">
			<div class="route-sprites">
				{#if areaSprite}
					<div class="sprite-with-edit">
						<Sprite data={areaSprite.data.buffer} width={areaSprite._width} height={areaSprite._height} />
						<button class="edit-btn" onclick={() => openEditor(areaSprite, [...routePath, 'areaSprite'], 'Area sprite')}>✏ Edit</button>
					</div>
				{/if}
				{#if areaNameSprite}
					<div class="sprite-with-edit">
						<Sprite data={areaNameSprite.data.buffer} width={areaNameSprite._width} height={areaNameSprite._height} />
						<button class="edit-btn" onclick={() => openEditor(areaNameSprite, [...routePath, 'areaNameSprite'], 'Area name sprite')}>✏ Edit</button>
					</div>
				{/if}
			</div>
			<div class="route-fields field-grid">
				<TextField path={[...infoPath, 'routeName']} label="Route name" maxLen={20} />
				<NumberField path={[...infoPath, 'routeImageIdx']} label="Route image idx" min={0} max={0xFF} />
			</div>
		</div>
	</section>

	<section>
		<h2>Walking Pokémon</h2>
		<div class="walk">
			<div class="sprite-with-edit">
				<AnimatedSprite frames={walkPokeLargeFrames} slowdown={2} />
				<div class="edit-pair">
					<button class="edit-btn" onclick={() => openEditor(walkPokeLargeFrames[0], [...routePath, 'walkPokeAnimatedSpriteLarge', 0], 'Walking poke (frame 1)')}>✏ Frame 1</button>
					<button class="edit-btn" onclick={() => openEditor(walkPokeLargeFrames[1], [...routePath, 'walkPokeAnimatedSpriteLarge', 1], 'Walking poke (frame 2)')}>✏ Frame 2</button>
					<button class="edit-btn" onclick={() => downloadGif(walkPokeLargeFrames, 'walking_poke')}>⇩ GIF</button>
				</div>
			</div>
			<div class="walk-fields field-grid">
				<TextField path={[...infoPath, 'nickname']} label="Nickname" maxLen={10} />
				<NumberField path={[...infoPath, 'friendship']} label="Friendship" min={0} max={0xFF} />
				<EnumField path={[...infoPath, 'poke', 'species']} label="Species" labels={species} />
				<NumberField path={[...infoPath, 'poke', 'level']} label="Level" min={1} max={100} />
				<EnumField path={[...infoPath, 'poke', 'heldItem']} label="Held item" labels={items} />
				{#each Array(4) as _, m}
					<EnumField path={[...infoPath, 'poke', 'moves', m]} label={`Move ${m + 1}`} labels={moves} />
				{/each}
			</div>
		</div>
	</section>

	<section>
		<h2>Catchable Pokémon</h2>
		<div class="grid3">
			{#each routePokes as poke, i (i)}
				<div class="card field-grid">
					<div class="sprite-with-edit">
						<AnimatedSprite frames={routePokeSpriteFrames[i]} />
						<div class="edit-pair">
							<button class="edit-btn" onclick={() => openEditor(routePokeSpriteFrames[i][0], [...routePath, 'routePokeSprites', i, 0], `Catchable #${i + 1} (frame 1)`)}>✏ F1</button>
							<button class="edit-btn" onclick={() => openEditor(routePokeSpriteFrames[i][1], [...routePath, 'routePokeSprites', i, 1], `Catchable #${i + 1} (frame 2)`)}>✏ F2</button>
							<button class="edit-btn" onclick={() => downloadGif(routePokeSpriteFrames[i], `catchable_${i + 1}`)}>⇩ GIF</button>
						</div>
					</div>
					{#if routePokeNameSprites[i]}
						<div class="sprite-with-edit">
							<Sprite
								data={routePokeNameSprites[i]!.data.buffer}
								width={routePokeNameSprites[i]!._width}
								height={routePokeNameSprites[i]!._height}
							/>
							<button class="edit-btn" onclick={() => openEditor(routePokeNameSprites[i], [...routePath, 'routePokeNameSprites', i], `Catchable #${i + 1} name`)}>✏ Edit name</button>
						</div>
					{/if}
					<EnumField path={[...infoPath, 'routePokes', i, 'species']} label="Species" labels={species} />
					<NumberField path={[...infoPath, 'routePokes', i, 'level']} label="Level" min={1} max={100} />
					<EnumField path={[...infoPath, 'routePokes', i, 'heldItem']} label="Held item" labels={items} />
					{#each Array(4) as _, m}
						<EnumField path={[...infoPath, 'routePokes', i, 'moves', m]} label={`Move ${m + 1}`} labels={moves} />
					{/each}
					<NumberField path={[...infoPath, 'routePokeChance', i]} label="Chance %" min={0} max={100} />
					<NumberField path={[...infoPath, 'routePokeMinSteps', i]} label="Min steps" min={0} max={0xFFFF} />
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2>Dowsable Items</h2>
		<div class="items-grid">
			{#each routeItems as _, i (i)}
				<div class="item-card field-grid">
					<div class="item-head">
						<span class="item-slot">#{i + 1}</span>
						{#if itemNameSprites[i]}
							<div class="sprite-with-edit">
								<Sprite
									data={itemNameSprites[i]!.data.buffer}
									width={itemNameSprites[i]!._width}
									height={itemNameSprites[i]!._height}
								/>
								<button class="edit-btn" onclick={() => openEditor(itemNameSprites[i], [...routePath, 'itemNameSprites', i], `Item #${i + 1} name`)}>✏ Edit name</button>
							</div>
						{/if}
					</div>
					<EnumField path={[...infoPath, 'routeItems', i]} label="Item" labels={items} />
					<NumberField path={[...infoPath, 'routeItemChance', i]} label="Chance %" min={0} max={100} />
					<NumberField path={[...infoPath, 'routeItemMinSteps', i]} label="Min steps" min={0} max={0xFFFF} />
				</div>
			{/each}
		</div>
	</section>
{/if}

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.5em 0;
		font-size: 1.05em;
		color: #222;
		border-bottom: 1px solid #ddd;
		padding-bottom: 0.2em;
	}
	.route-head, .walk { display: flex; gap: 1.5em; align-items: flex-start; flex-wrap: wrap; }
	.route-sprites, .walk-fields { display: flex; flex-direction: column; gap: 0.5em; min-width: 0; }
	.walk-fields { flex: 1 1 16em; }
	.route-fields { flex: 1 1 16em; }
	.grid3 {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1em;
	}
	.card {
		display: flex; flex-direction: column; gap: 0.3em;
		padding: 0.6em; background: #fafafa; border: 1px solid #eee; border-radius: 4px;
		min-width: 0;
	}
	.items-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.7em;
	}
	.item-card {
		padding: 0.6em;
		background: #fafafa;
		border: 1px solid #eee;
		border-radius: 4px;
		min-width: 0;
	}
	.item-head {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding-bottom: 0.4em;
		margin-bottom: 0.3em;
		border-bottom: 1px solid #eee;
	}
	.item-slot { font-family: ui-monospace, monospace; color: #999; font-size: 0.85em; }

	.editor-panel {
		background: #f5fbf5;
		border: 1px solid #6a8;
		border-radius: 6px;
		padding: 0.7em;
	}
	.editor-panel h2 {
		border-bottom-color: #b8d8b8;
	}
	.sprite-with-edit {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3em;
	}
	.edit-pair { display: flex; gap: 0.3em; }
	.edit-btn {
		padding: 0.15em 0.6em;
		background: white;
		border: 1px solid #ccc;
		border-radius: 3px;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.8em;
		color: #444;
	}
	.edit-btn:hover { background: #f0f0f0; }
</style>
