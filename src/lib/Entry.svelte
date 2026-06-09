<script lang="ts">
	import type { Sprite as SpriteSpec } from '../pokewalker/spec';
	import Expandable from './Expandable.svelte';
	import Folder from './Folder.svelte';
	import HexView from './HexView.svelte';
	import Sprite from './Sprite.svelte';

	interface Props {
		name: string;
		value: unknown;
	}
	let { name, value }: Props = $props();

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
			? value._annotate
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
</script>

{#if displayValue == null || typeof displayValue !== 'object'}
	<span class="type">{@html icon}</span><span class="entry-name">{name}</span> =
	<span>{JSON.stringify(displayValue)} {#if annotate != null}({annotate}){/if}</span>
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
					data={displayValue.data.buffer as ArrayBuffer}
					width={displayValue._width}
					height={displayValue._height}
				/>
			{:else if displayValue instanceof Uint8Array}
				<HexView data={displayValue.buffer as ArrayBuffer} />
			{:else}
				<Folder data={displayValue as Record<string, unknown>} />
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
</style>
