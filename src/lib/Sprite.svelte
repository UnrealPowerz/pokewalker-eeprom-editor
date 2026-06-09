<script lang="ts">
    import { onMount } from "svelte";
    import { decodeSprite } from "../pokewalker/decode-sprite";

    let { data, width, height }: { data: ArrayBuffer, width: number, height: number } = $props();

    let canvas: HTMLCanvasElement;

    onMount(() => {
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.putImageData(decodeSprite(data, width, height), 0, 0)
    })
</script>

<div>
    Sprite ({width}x{height})
</div>
<canvas bind:this={canvas}></canvas>

<style>
    canvas {
        max-height: 200px;
        width: 200px;
        image-rendering: pixelated;
    }
</style>