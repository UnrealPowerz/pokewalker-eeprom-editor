<script lang="ts">
	import { decodeSprite } from '../pokewalker/decode-sprite';

	interface Props {
		data: ArrayBuffer;
		width: number;
		height: number;
	}
	let { data, width, height }: Props = $props();

	let canvas = $state<HTMLCanvasElement>();

	$effect(() => {
		if (!canvas) return;
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d')?.putImageData(decodeSprite(data, width, height), 0, 0);
	});
</script>

<div>Sprite ({width}x{height})</div>
<canvas bind:this={canvas}></canvas>

<style>
	canvas {
		max-height: 200px;
		width: 200px;
		image-rendering: pixelated;
	}
</style>
