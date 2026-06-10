<script lang="ts">
	import { decodeSprite } from '../pokewalker/decode-sprite';

	interface Props {
		data: ArrayBufferLike;
		width: number;
		height: number;
		// Pixel scale factor. Default 4× gives reasonable thumbnail size for
		// the small sprites the walker uses (16-64 px wide). Set to 1 inside
		// a fixed-size container that handles its own scaling (gallery).
		scale?: number;
	}
	let { data, width, height, scale = 4 }: Props = $props();

	let canvas = $state<HTMLCanvasElement>();

	$effect(() => {
		if (!canvas) return;
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d')?.putImageData(decodeSprite(data, width, height), 0, 0);
	});
</script>

<canvas
	bind:this={canvas}
	style:width={`${width * scale}px`}
	style:height={`${height * scale}px`}
></canvas>

<style>
	canvas {
		image-rendering: pixelated;
		max-width: 100%;
	}
</style>
