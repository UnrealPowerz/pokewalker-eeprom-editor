<script lang="ts">
    import Expandable from "./Expandable.svelte";
    import type { Sprite as SpriteSpec } from "../pokewalker/spec";
    import Sprite from "./Sprite.svelte";
    import Folder from "./Folder.svelte";
    import HexView from "./HexView.svelte";

    let { name, value }: { name: string, value: unknown } = $props();

    const displayValue = $derived(typeof value === 'object' && value != null && '_data' in value ? value._data : value);
    const annotate = $derived(typeof value === 'object' && value != null && '_annotate' in value ? value._annotate : undefined);

    const isSprite = (v: Object): v is ReturnType<ReturnType<typeof SpriteSpec>['read']> =>
        '_type' in v && v._type === 'sprite'

    const getIconForEntry = (value: unknown) => {
        if (value == null || typeof value !== 'object') {
            if (typeof value === 'number') {
                return '#'
            } else if (typeof value === 'string'){
                return 'Abc'
            }
        } else if (Array.isArray(value)) {
            return "[]"
        } else if (isSprite(value)) {
            return '<span class="material-symbols-outlined">image</span>'
        } else if (displayValue instanceof Uint8Array) {
            return '01'
        }
        return '{}'
    }

    const icon = $derived(getIconForEntry(displayValue));
</script>

{#if displayValue == null || typeof displayValue !== 'object'}
<span class="type">{@html icon}</span><span class="name">{name}</span> = <span>{JSON.stringify(displayValue)} {#if annotate != null}({annotate}){/if}</span>
{:else}
<Expandable>
    {#snippet header()}
        <span class="type">{@html icon}</span><span class="name">{name} {#if annotate != null} ({annotate}){/if}</span>
    {/snippet}
    {#snippet body()}
        {#if isSprite(displayValue)}
        <Sprite data={displayValue.data.buffer as ArrayBuffer} width={displayValue._width} height={displayValue._height}/>
        {:else if displayValue instanceof Uint8Array}
        <HexView data={displayValue.buffer as ArrayBuffer}/>
        {:else}
        <Folder children={displayValue}/>
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
    .name {
        display: inline-block;
        min-width: 8em;
    }
</style>
