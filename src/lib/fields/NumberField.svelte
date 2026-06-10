<script lang="ts">
	import { parsed, setField } from '../../state/eeprom.svelte'
	import { getAtPath } from '../../state/path'

	interface Props {
		path: (string | number)[]
		label: string
		min?: number
		max?: number
		hex?: boolean  // display as 0xNN
		readonly?: boolean
		hint?: string
	}
	let { path, label, min = 0, max = 0xFFFFFFFF, hex = false, readonly = false, hint }: Props = $props()

	const value = $derived(getAtPath(parsed(), path) as number | undefined)

	const display = $derived.by(() => {
		if (value == null) return ''
		if (hex) return '0x' + value.toString(16).toUpperCase()
		return String(value)
	})

	const handleInput = (e: Event) => {
		const input = e.target as HTMLInputElement
		const text = input.value.trim()
		let n: number
		if (text.startsWith('0x') || text.startsWith('0X')) {
			n = parseInt(text.slice(2), 16)
		} else {
			n = parseInt(text, 10)
		}
		if (Number.isNaN(n)) return
		if (n < min) n = min
		if (n > max) n = max
		setField(path, n)
	}
</script>

<label>
	<span class="label">{label}</span>
	<input
		type="text"
		value={display}
		readonly={readonly || value == null}
		onchange={handleInput}
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
		max-width: 12em;
	}
	input[readonly] {
		background: #f5f5f5;
		color: #888;
	}
	.hint {
		color: #888;
		font-size: 0.85em;
	}
</style>
