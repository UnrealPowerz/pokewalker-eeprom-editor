<script lang="ts">
	import { parsed, setField } from '../../state/eeprom.svelte'
	import { getAtPath } from '../../state/path'

	interface EnumValue { _data: number; _annotate: string; _type: 'enum' }

	interface Props {
		path: (string | number)[]
		label: string
		labels: readonly string[]
		hint?: string
	}
	let { path, label, labels, hint }: Props = $props()

	const value = $derived(getAtPath(parsed(), path) as EnumValue | undefined)
	const code = $derived(value?._data ?? 0)
	const currentLabel = $derived(code < labels.length ? labels[code] : `#INVALID# (${code})`)

	let open = $state(false)
	let query = $state('')
	let highlight = $state(0)
	let inputEl: HTMLInputElement | undefined = $state()
	let listEl: HTMLUListElement | undefined = $state()
	const listboxId = `enum-listbox-${Math.random().toString(36).slice(2, 9)}`

	// Build the filtered list as {idx, label} pairs. We index against the
	// FULL label array so selecting yields the original enum code regardless
	// of filtering.
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase()
		const out: { idx: number; label: string }[] = []
		for (let i = 0; i < labels.length; i++) {
			if (!q || labels[i].toLowerCase().includes(q)) {
				out.push({ idx: i, label: labels[i] })
			}
		}
		return out
	})

	const openPopup = () => {
		if (value == null) return
		query = ''
		highlight = matches.findIndex((m) => m.idx === code)
		if (highlight < 0) highlight = 0
		open = true
		inputEl?.select()
	}

	const closePopup = () => { open = false }

	const choose = (idx: number) => {
		if (!value) return
		setField(path, { _data: idx, _annotate: labels[idx] ?? '#INVALID#', _type: 'enum' })
		closePopup()
		inputEl?.blur()
	}

	const onInput = (e: Event) => {
		query = (e.target as HTMLInputElement).value
		open = true
		highlight = 0
	}

	const onKey = (e: KeyboardEvent) => {
		if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
			e.preventDefault()
			openPopup()
			return
		}
		if (!open) return
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			highlight = Math.min(highlight + 1, matches.length - 1)
			scrollHighlightIntoView()
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			highlight = Math.max(highlight - 1, 0)
			scrollHighlightIntoView()
		} else if (e.key === 'Enter') {
			e.preventDefault()
			if (matches[highlight]) choose(matches[highlight].idx)
		} else if (e.key === 'Escape') {
			e.preventDefault()
			closePopup()
		}
	}

	const scrollHighlightIntoView = () => {
		if (!listEl) return
		const el = listEl.children[highlight] as HTMLElement | undefined
		el?.scrollIntoView({ block: 'nearest' })
	}

	// Click outside closes the popup. We attach during open.
	$effect(() => {
		if (!open) return
		const onDocClick = (e: MouseEvent) => {
			if (!inputEl || !listEl) return
			const t = e.target as Node
			if (inputEl.contains(t) || listEl.contains(t)) return
			closePopup()
		}
		document.addEventListener('mousedown', onDocClick)
		return () => document.removeEventListener('mousedown', onDocClick)
	})
</script>

<label>
	<span class="label">{label}</span>
	<span class="combo">
		<input
			bind:this={inputEl}
			type="text"
			disabled={value == null}
			value={open ? query : currentLabel}
			placeholder={currentLabel}
			role="combobox"
			aria-expanded={open}
			aria-controls={listboxId}
			aria-autocomplete="list"
			onfocus={openPopup}
			oninput={onInput}
			onkeydown={onKey}
		/>
		{#if open}
			<ul bind:this={listEl} id={listboxId} role="listbox">
				{#each matches.slice(0, 200) as m, i (m.idx)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
					<li
						role="option"
						aria-selected={m.idx === code}
						class:highlight={i === highlight}
						class:active={m.idx === code}
						onmousedown={(e) => { e.preventDefault(); choose(m.idx) }}
						onmouseenter={() => { highlight = i }}
					>
						<span class="code">{m.idx}</span>
						<span class="lbl">{m.label}</span>
					</li>
				{/each}
				{#if matches.length === 0}
					<li class="empty">no matches</li>
				{:else if matches.length > 200}
					<li class="empty">+{matches.length - 200} more — refine search</li>
				{/if}
			</ul>
		{/if}
	</span>
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
	.combo {
		position: relative;
		flex: 1 1 8em;
		min-width: 0;
		max-width: 16em;
	}
	input {
		font-family: ui-monospace, monospace;
		padding: 0.25em 0.4em;
		border: 1px solid #ccc;
		border-radius: 3px;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}
	input:focus { outline: 2px solid #cce; border-color: #4477aa; }
	ul {
		position: absolute;
		top: calc(100% + 2px);
		left: 0;
		min-width: 100%;
		max-height: 18em;
		overflow-y: auto;
		background: white;
		border: 1px solid #aac;
		border-radius: 3px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.12);
		list-style: none;
		margin: 0;
		padding: 2px 0;
		z-index: 100;
	}
	li {
		display: flex;
		gap: 0.6em;
		padding: 0.2em 0.6em;
		cursor: pointer;
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
		white-space: nowrap;
	}
	li.highlight { background: #cce4ff; }
	li.active { font-weight: bold; }
	li .code { color: #999; min-width: 3em; text-align: right; }
	li.empty { color: #888; font-style: italic; cursor: default; }
	.hint { color: #888; font-size: 0.85em; }
</style>
