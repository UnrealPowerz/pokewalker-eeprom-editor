<script lang="ts">
	import { parsed, setField } from '../../state/eeprom.svelte'
	import { getAtPath } from '../../state/path'

	interface Props {
		// path to a u8 field
		path: (string | number)[]
		label: string
		// bit position (0 = LSB, 7 = MSB)
		bit: number
		// optional bit-width if you want to edit a multi-bit range. Default 1.
		width?: number
	}
	let { path, label, bit, width = 1 }: Props = $props()

	const byte = $derived(getAtPath(parsed(), path) as number | undefined)
	const mask = $derived(((1 << width) - 1) << bit)
	const value = $derived(byte == null ? 0 : (byte >> bit) & ((1 << width) - 1))

	const handleToggle = () => {
		if (byte == null) return
		// Toggle for width=1; for wider widths use the range input below
		const next = (byte & ~mask) | ((((byte >> bit) & 1) ^ 1) << bit)
		setField(path, next)
	}

	const handleRange = (e: Event) => {
		if (byte == null) return
		const v = +(e.target as HTMLInputElement).value
		const clamped = v & ((1 << width) - 1)
		const next = (byte & ~mask) | (clamped << bit)
		setField(path, next)
	}
</script>

<label>
	<span class="label">{label}</span>
	{#if width === 1}
		<input
			type="checkbox"
			checked={value === 1}
			disabled={byte == null}
			onchange={handleToggle}
		/>
	{:else}
		<input
			type="number"
			min="0"
			max={((1 << width) - 1)}
			value={value}
			disabled={byte == null}
			onchange={handleRange}
		/>
	{/if}
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
	input[type="number"] {
		font-family: ui-monospace, monospace;
		padding: 0.25em 0.4em;
		border: 1px solid #ccc;
		border-radius: 3px;
		width: 5em;
	}
</style>
