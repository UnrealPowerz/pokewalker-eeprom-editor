<script lang="ts">
	import NumberField from '../lib/fields/NumberField.svelte'
	import TextField from '../lib/fields/TextField.svelte'
	import BitField from '../lib/fields/BitField.svelte'
	import { parsed } from '../state/eeprom.svelte'
	import { getAtPath } from '../state/path'
	import { formatEventTime } from '../pokewalker/event-log-types'

	// The walking-Pokémon nickname lives in currentRoute.routeInfo.nickname,
	// not here. Editable on the Route tab.

	const base = ['reliableSaves', 'important1'] as const
	const id = [...base, 'identity']
	const sb = [...base, 'saveBlock']
	const specials: (string | number)[] = ['receivedSpecials', 'receivedSet']

	const tree = $derived(parsed())
	const numResets = $derived(getAtPath(tree, ['header', 'numResets']) as number | undefined)
	const lastSync = $derived(getAtPath(tree, [...id, 'lastSyncTime']) as number | undefined)
</script>

<section class="field-grid">
	<h2>Trainer</h2>
	<TextField path={[...id, 'trainerName']} label="Trainer name" maxLen={7} />
	<NumberField path={[...id, 'trainerTID']} label="TID" min={0} max={0xFFFF} />
	<NumberField path={[...id, 'trainerSID']} label="SID" min={0} max={0xFFFF} />
</section>

<section class="field-grid">
	<h2>Progress</h2>
	<NumberField path={[...sb, 'lifetimeSteps']} label="Lifetime steps" min={0} />
	<NumberField path={[...sb, 'walkSessionSteps']} label="Session steps" min={0} />
	<NumberField path={[...sb, 'curWatts']} label="Watts" min={0} max={0xFFFF} />
	<NumberField path={[...sb, 'dayCounter']} label="Day counter" min={0} max={0xFFFF} />
</section>

<section class="field-grid">
	<h2>Sound &amp; display</h2>
	<BitField path={[...sb, 'settings']} label="Mute" bit={0} />
	<BitField path={[...sb, 'settings']} label="Volume" bit={1} width={2} />
	<BitField path={[...sb, 'settings']} label="Contrast" bit={3} width={4} />
</section>

<section class="field-grid">
	<h2>Received specials</h2>
	<p class="hint">Flags set when the walker accepts an event delivery from the DS over IR.</p>
	<BitField path={specials} label="Stamps" bit={0} width={4} />
	<BitField path={specials} label="Special map" bit={4} />
	<BitField path={specials} label="Event Pokémon" bit={5} />
	<BitField path={specials} label="Event item" bit={6} />
	<BitField path={specials} label="Special route" bit={7} />
</section>

<section class="field-grid">
	<h2>Walker info</h2>
	<NumberField path={['header', 'numResets']} label="Number of resets" min={0} max={0xFF} />
	<NumberField path={[...id, 'protoVer']} label="Protocol version" min={0} max={0xFF} />
	<NumberField path={[...id, 'protoSubver']} label="Protocol subversion" min={0} max={0xFF} />
	<NumberField path={[...id, 'loc']} label="Location code" min={0} max={0xFFFF} />
	<NumberField path={[...id, 'id']} label="Identity ID" min={0} hex />
	<NumberField path={[...id, 'stepCount']} label="Steps at last sync" min={0} />
	<div class="readonly-row">
		<span class="rl-label">Last sync clock</span>
		<span class="rl-val">
			{formatEventTime(lastSync ?? 0)}
			<span class="raw">(raw {lastSync ?? 0})</span>
		</span>
	</div>
	<div class="readonly-row">
		<span class="rl-label">Reset count</span>
		<span class="rl-val">{numResets ?? '?'}</span>
	</div>
</section>

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.5em 0; font-size: 1.05em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
	}
	.hint { color: #666; font-size: 0.85em; margin: 0 0 0.4em; }
	.readonly-row {
		display: flex; align-items: center; gap: 0.5em;
		padding: 0.3em 0;
	}
	.rl-label { min-width: 12em; color: #444; }
	.rl-val { color: #222; font-family: ui-monospace, monospace; font-size: 0.9em; }
	.raw { color: #888; font-size: 0.85em; margin-left: 0.4em; }
</style>
