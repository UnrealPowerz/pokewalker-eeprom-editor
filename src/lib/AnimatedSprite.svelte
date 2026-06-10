<script lang="ts">
	import Sprite from './Sprite.svelte'
	import { animTick } from '../state/anim-tick.svelte'

	interface SpriteVal {
		data: Uint8Array
		_width: number
		_height: number
		_type: 'sprite'
	}

	interface Props {
		frames: (SpriteVal | undefined)[]
		// How many shared ticks each frame holds for. Default 1 = flips every
		// shared tick (~300ms). Set higher to slow this sprite without
		// affecting others (e.g. walking pokémon = 2 for ~600ms/frame).
		slowdown?: number
	}
	let { frames, slowdown = 1 }: Props = $props()

	const valid = $derived(frames.filter((f): f is SpriteVal => !!f))
	const current = $derived(
		valid.length === 0
			? undefined
			: valid[Math.floor(animTick() / slowdown) % valid.length],
	)
</script>

{#if current}
	<Sprite data={current.data.buffer} width={current._width} height={current._height} />
{/if}
