<script lang="ts">
	import { parsed, setField } from '../../state/eeprom.svelte'
	import { getAtPath } from '../../state/path'
	import { editPokeString } from '../../pokewalker/edit-poke-string'
	import type { PokeStringValue } from '../../pokewalker/spec'

	interface Props {
		path: (string | number)[]
		label: string
		maxLen?: number
		hint?: string
	}
	let { path, label, maxLen, hint }: Props = $props()

	const value = $derived(getAtPath(parsed(), path) as PokeStringValue | undefined)
	const text = $derived(value?._data ?? '')

	const handleInput = (e: Event) => {
		if (!value) return
		const newText = (e.target as HTMLInputElement).value
		const updated = editPokeString(value, newText)
		setField(path, updated)
	}
</script>

<label>
	<span class="label">{label}</span>
	<input
		type="text"
		value={text}
		maxlength={maxLen}
		onchange={handleInput}
		disabled={value == null}
	/>
	{#if hint}<span class="hint">{hint}</span>{/if}
</label>

<style>
	label {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.3em 0;
		min-width: 0;
	}
	.label {
		min-width: 7em;
		flex: 0 0 auto;
		color: #444;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	input {
		font-family: ui-monospace, monospace;
		padding: 0.25em 0.4em;
		border: 1px solid #ccc;
		border-radius: 3px;
		min-width: 0;
		flex: 1 1 6em;
		max-width: 14em;
	}
	.hint {
		color: #888;
		font-size: 0.85em;
	}
</style>
