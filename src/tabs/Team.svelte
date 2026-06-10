<script lang="ts">
	import NumberField from '../lib/fields/NumberField.svelte'
	import TextField from '../lib/fields/TextField.svelte'
	import EnumField from '../lib/fields/EnumField.svelte'
	import { parsed, setField } from '../state/eeprom.svelte'
	import { getAtPath } from '../state/path'
	import { species } from '../pokewalker/types/species'
	import { items } from '../pokewalker/types/items'
	import { moves } from '../pokewalker/types/moves'

	interface EnumVal { _data: number; _annotate: string; _type: 'enum' }

	const teamPath: (string | number)[] = ['ourTeam', 'team']
	const team = $derived(getAtPath(parsed(), teamPath) as Record<string, unknown> | undefined)
	const pokes = $derived((team?.pokes ?? []) as Record<string, unknown>[])

	const pokePath = (i: number) => [...teamPath, 'pokes', i]

	const STAT_NAMES = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'] as const

	// IVs are bitpacked into a u32: 5 bits per stat × 6 stats = 30 bits.
	// Bits 30-31 are gen-IV "egg" and "nicknamed" flags.
	const readIv = (packed: number, statIdx: number): number =>
		(packed >>> (statIdx * 5)) & 0x1F

	const writeIv = (packed: number, statIdx: number, val: number): number => {
		const mask = 0x1F << (statIdx * 5)
		return ((packed & ~mask) >>> 0) | ((val & 0x1F) << (statIdx * 5))
	}

	const setIv = (pokeIdx: number, statIdx: number, val: number) => {
		const cur = (pokes[pokeIdx]?.ivs as number) ?? 0
		setField([...pokePath(pokeIdx), 'ivs'], writeIv(cur, statIdx, val))
	}

	const numFromInput = (e: Event, fallback: number, lo: number, hi: number): number => {
		const v = parseInt((e.target as HTMLInputElement).value, 10)
		if (!Number.isFinite(v)) return fallback
		return Math.max(lo, Math.min(hi, v))
	}
</script>

{#if !team}
	<p>Load an EEPROM dump to see your team.</p>
{:else}
	<section class="field-grid">
		<h2>Trainer</h2>
		<TextField path={[...teamPath, 'name']} label="Name" maxLen={7} />
		<NumberField path={[...teamPath, 'tid']} label="TID" min={0} max={0xFFFF} />
		<NumberField path={[...teamPath, 'sid']} label="SID" min={0} max={0xFFFF} />
	</section>

	<section>
		<h2>Pokémon (×6)</h2>
		<div class="grid">
			{#each pokes as poke, i (i)}
				{@const species_ = poke.species as EnumVal | undefined}
				{@const item = poke.heldItem as EnumVal | undefined}
				{@const movesArr = (poke.moves ?? []) as EnumVal[]}
				{@const empty = !species_ || species_._data === 0}
				<div class="card field-grid" class:empty>
					<div class="head">
						<span class="slot">#{i + 1}</span>
						<span class="title">
							{empty ? '(empty)' : species_!._annotate}
							{#if !empty}<span class="lvl">L{poke.level ?? '?'}</span>{/if}
						</span>
					</div>
					<EnumField path={[...pokePath(i), 'species']} label="Species" labels={species} />
					<TextField path={[...pokePath(i), 'nickname']} label="Nickname" maxLen={9} />
					<NumberField path={[...pokePath(i), 'level']} label="Level" min={1} max={100} />
					<EnumField path={[...pokePath(i), 'heldItem']} label="Held item" labels={items} />
					{#each Array(4) as _, m}
						<EnumField path={[...pokePath(i), 'moves', m]} label={`Move ${m + 1}`} labels={moves} />
					{/each}
					<NumberField path={[...pokePath(i), 'happiness']} label="Happiness" min={0} max={255} />

					<details>
						<summary>Stats &amp; origin</summary>
						<div class="editable-stats field-grid">
							<p class="caveat">
								These fields haven't been fully verified against game behaviour — the
								layout (especially the IV bitpacking and the ability/variant/source-game
								bytes) is inferred from the spec but not yet round-tripped through a
								real walker. Edit at your own risk.
							</p>
							<NumberField path={[...pokePath(i), 'otTID']} label="OT TID" min={0} max={0xFFFF} />
							<NumberField path={[...pokePath(i), 'otSID']} label="OT SID" min={0} max={0xFFFF} />
							<NumberField path={[...pokePath(i), 'pid']} label="PID" min={0} hex />
							<NumberField path={[...pokePath(i), 'ability']} label="Ability" min={0} max={255} />
							<NumberField path={[...pokePath(i), 'variant']} label="Variant" min={0} max={255} />
							<NumberField path={[...pokePath(i), 'sourceGame']} label="Source game" min={0} max={255} />

							<div class="stat-grid">
								<div class="stat-header">IVs</div>
								{#each STAT_NAMES as name, s (name)}
									{@const iv = readIv((poke.ivs as number) ?? 0, s)}
									<label class="stat-cell">
										<span>{name}</span>
										<input
											type="number"
											min="0" max="31"
											value={iv}
											onchange={(e) => setIv(i, s, numFromInput(e, iv, 0, 31))}
										/>
									</label>
								{/each}
							</div>

							<div class="stat-grid">
								<div class="stat-header">EVs</div>
								{#each STAT_NAMES as name, s (name)}
									<NumberField path={[...pokePath(i), 'evs', s]} label={name} min={0} max={255} />
								{/each}
							</div>
						</div>
					</details>
				</div>
			{/each}
		</div>
	</section>
{/if}

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.5em 0; font-size: 1.05em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1em;
	}
	.card {
		padding: 0.7em;
		background: #fafafa;
		border: 1px solid #eee;
		border-radius: 4px;
		min-width: 0;
		overflow: hidden;
	}
	.card.empty { opacity: 0.55; }
	.head {
		display: flex; align-items: baseline; gap: 0.5em;
		margin-bottom: 0.5em; padding-bottom: 0.3em;
		border-bottom: 1px solid #eee;
	}
	.slot { font-family: ui-monospace, monospace; color: #999; }
	.title { font-weight: bold; color: #222; }
	.lvl { color: #666; font-weight: normal; margin-left: 0.4em; font-size: 0.9em; }
	details summary { cursor: pointer; color: #888; font-size: 0.85em; margin-top: 0.4em; }
	.editable-stats { padding-top: 0.4em; }
	.caveat {
		background: #fff7e8;
		border: 1px solid #f1c789;
		color: #934;
		padding: 0.4em 0.6em;
		border-radius: 4px;
		font-size: 0.8em;
		margin: 0 0 0.6em;
		line-height: 1.35;
	}
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(5em, 1fr));
		gap: 0.2em 0.5em;
		padding: 0.4em 0 0.2em;
		border-top: 1px solid #eee;
		margin-top: 0.4em;
	}
	.stat-header {
		grid-column: 1 / -1;
		color: #666;
		font-size: 0.85em;
		font-weight: 500;
	}
	.stat-cell {
		display: flex;
		flex-direction: column;
		gap: 0.1em;
		min-width: 0;
	}
	.stat-cell span { color: #888; font-size: 0.75em; }
	.stat-cell input {
		font-family: ui-monospace, monospace;
		padding: 0.2em 0.3em;
		border: 1px solid #ccc;
		border-radius: 3px;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
	}
</style>
