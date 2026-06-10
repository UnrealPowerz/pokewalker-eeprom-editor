<script lang="ts">
	import type { Sprite as SpriteSpec } from '../pokewalker/spec';
	import Expandable from './Expandable.svelte';
	import Folder from './Folder.svelte';
	import HexView from './HexView.svelte';
	import Sprite from './Sprite.svelte';
	import { setFieldRaw, getOffsetForPath } from '../state/eeprom.svelte';

	interface Props {
		name: string;
		value: unknown;
		path: (string | number)[];
	}
	let { name, value, path }: Props = $props();

	type SpriteValue = ReturnType<ReturnType<typeof SpriteSpec>['read']>;

	const isSprite = (v: object): v is SpriteValue =>
		'_type' in v && v._type === 'sprite';

	const displayValue = $derived(
		typeof value === 'object' && value != null && '_data' in value
			? value._data
			: value,
	);
	const annotate = $derived(
		typeof value === 'object' && value != null && '_annotate' in value
			? (value as { _annotate: unknown })._annotate
			: undefined,
	);
	const wrappedType = $derived(
		value != null && typeof value === 'object' && '_type' in value
			? (value as { _type: string })._type
			: undefined,
	);

	const icon = $derived.by((): string => {
		const v = displayValue;
		if (v == null || typeof v !== 'object') {
			if (typeof v === 'number') return '#';
			if (typeof v === 'string') return 'Abc';
			return '{}';
		}
		if (Array.isArray(v)) return '[]';
		if (isSprite(v)) return '<span class="material-symbols-outlined">image</span>';
		if (v instanceof Uint8Array) return '01';
		return '{}';
	});

	const baseOffset = $derived(getOffsetForPath(path)?.offset ?? null);

	// Inline edit handlers — raw writes only, no reliable-save sync.
	const handleNumberEdit = (e: Event) => {
		const text = (e.target as HTMLInputElement).value.trim();
		const n = text.startsWith('0x') || text.startsWith('0X')
			? parseInt(text.slice(2), 16)
			: parseInt(text, 10);
		if (!Number.isFinite(n)) return;
		setFieldRaw(path, n);
	};

	const handleStringEdit = (e: Event) => {
		if (wrappedType !== 'pokestring') return;
		// For raw editing of a PokeString, replace the wrapped value's _raw
		// bytes by re-encoding the displayed text. We import lazily to avoid
		// pulling the editor helper into bundles that don't need it.
		import('../pokewalker/edit-poke-string').then(({ editPokeString }) => {
			const newText = (e.target as HTMLInputElement).value;
			const next = editPokeString(value as Parameters<typeof editPokeString>[0], newText);
			setFieldRaw(path, next);
		});
	};
</script>

{#if displayValue == null || typeof displayValue !== 'object'}
	<span class="type">{@html icon}</span><span class="entry-name">{name}</span> =
	{#if typeof displayValue === 'number'}
		<input
			class="inline-edit"
			type="text"
			value={displayValue}
			onchange={handleNumberEdit}
			title="Raw edit — bypasses reliable-save sync"
		/>
		{#if annotate != null}<span class="annot">({annotate})</span>{/if}
	{:else if typeof displayValue === 'string' && wrappedType === 'pokestring'}
		<input
			class="inline-edit"
			type="text"
			value={displayValue}
			onchange={handleStringEdit}
			title="Raw edit — bypasses reliable-save sync"
		/>
	{:else}
		<span>{JSON.stringify(displayValue)} {#if annotate != null}({annotate}){/if}</span>
	{/if}
{:else}
	<Expandable>
		{#snippet header()}
			<span class="type">{@html icon}</span><span class="entry-name"
				>{name} {#if annotate != null}({annotate}){/if}</span
			>
		{/snippet}
		{#snippet body()}
			{#if isSprite(displayValue)}
				<Sprite
					data={displayValue.data.buffer}
					width={displayValue._width}
					height={displayValue._height}
				/>
			{:else if displayValue instanceof Uint8Array}
				<HexView data={displayValue.buffer as ArrayBuffer} baseOffset={baseOffset ?? undefined} />
			{:else}
				<Folder data={displayValue as Record<string, unknown>} {path} />
			{/if}
		{/snippet}
	</Expandable>
{/if}

<style>
	.type {
		display: inline-block;
		width: 1.5em;
		text-align: center;
		color: blue;
		padding-right: 1em;
	}
	.entry-name {
		display: inline-block;
		min-width: 8em;
	}
	.inline-edit {
		font-family: ui-monospace, monospace;
		padding: 0 0.3em;
		border: 1px solid #ddd;
		border-radius: 3px;
		background: #fdfdf7;
		width: 10em;
	}
	.inline-edit:focus {
		border-color: #c63;
		background: #fff;
		outline: 2px solid #f1c789;
	}
	.annot { color: #888; font-size: 0.9em; margin-left: 0.3em; }
</style>
