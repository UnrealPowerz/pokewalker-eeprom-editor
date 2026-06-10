<script lang="ts">
	import { setByteRaw } from '../state/eeprom.svelte';

	interface Props {
		data: ArrayBuffer;
		// Absolute EEPROM offset of byte 0 in `data`. When provided, every
		// byte cell becomes editable and writes through setByteRaw.
		baseOffset?: number;
	}
	let { data, baseOffset }: Props = $props();

	const bytes = $derived(new Uint8Array(data));
	const ROW = 16;
	const rowCount = $derived(Math.ceil(bytes.length / ROW));
	const editable = $derived(baseOffset !== undefined);

	const allByte = $derived.by(() => {
		if (bytes.length < 2) return undefined;
		const first = bytes[0];
		for (let i = 1; i < bytes.length; i++) if (bytes[i] !== first) return undefined;
		return first;
	});

	// Windowed rendering — only mount rows visible in the scroll viewport,
	// plus a small overscan above and below for smooth scrolling. With 4096
	// rows × 17 cells × inputs in the whole-EEPROM view, mounting all of
	// them at once is ~70k nodes and tanks load time; here we keep it to
	// the few hundred actually on-screen.
	const ROW_PX = 22;            // matches td height in CSS below
	const HEADER_PX = 0;          // table has no thead
	const OVERSCAN = 8;           // rows above + below the viewport

	let scroller: HTMLDivElement | undefined = $state();
	let scrollTop = $state(0);
	let viewportH = $state(320);

	$effect(() => {
		if (!scroller) return;
		const update = () => {
			if (!scroller) return;
			scrollTop = scroller.scrollTop;
			viewportH = scroller.clientHeight;
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(scroller);
		return () => ro.disconnect();
	});

	const firstRow = $derived(Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN));
	const visibleCount = $derived(Math.ceil(viewportH / ROW_PX) + OVERSCAN * 2);
	const lastRow = $derived(Math.min(rowCount, firstRow + visibleCount));
	const padTopPx = $derived(firstRow * ROW_PX);
	const totalHeightPx = $derived(rowCount * ROW_PX + HEADER_PX);

	const handleByteEdit = (i: number, e: Event) => {
		if (baseOffset === undefined) return;
		const text = (e.target as HTMLInputElement).value.trim();
		const n = parseInt(text, 16);
		if (!Number.isFinite(n) || n < 0 || n > 0xFF) {
			(e.target as HTMLInputElement).value = bytes[i].toString(16).padStart(2, '0');
			return;
		}
		setByteRaw(baseOffset + i, n, `raw byte @0x${(baseOffset + i).toString(16)}`);
	};
</script>

<div class="info">
	{data.byteLength} bytes
	{#if baseOffset !== undefined} · base 0x{baseOffset.toString(16).toUpperCase()}{/if}
	{#if allByte !== undefined}(all 0x{allByte.toString(16).padStart(2, '0')}){/if}
</div>

<div
	class="scroll"
	bind:this={scroller}
	onscroll={(e) => scrollTop = (e.currentTarget as HTMLDivElement).scrollTop}
>
	<div class="virtual" style:height={`${totalHeightPx}px`}>
		<table class="view" style:transform={`translateY(${padTopPx}px)`}>
			<tbody>
				{#each Array(lastRow - firstRow) as _, vi (firstRow + vi)}
					{@const r = firstRow + vi}
					{@const off = r * ROW}
					<tr>
						<td class="offset">
							{((baseOffset ?? 0) + off).toString(16).padStart(6, '0')}
						</td>
						{#each Array(ROW) as _, c (c)}
							{@const i = off + c}
							{#if i < bytes.length}
								<td class="byte">
									{#if editable}
										<input
											type="text"
											value={bytes[i].toString(16).padStart(2, '0')}
											maxlength="2"
											onchange={(e) => handleByteEdit(i, e)}
										/>
									{:else}
										{bytes[i].toString(16).padStart(2, '0')}
									{/if}
								</td>
							{:else}
								<td></td>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.info { font-size: 0.85em; color: #666; margin-bottom: 0.3em; }
	.scroll {
		max-height: 60vh;
		min-height: 200px;
		max-width: 100%;
		width: fit-content;
		overflow: auto;
		border: 1px solid #ddd;
		background: white;
	}
	.virtual { position: relative; display: inline-block; }
	.view {
		border-collapse: collapse;
		position: relative;
		top: 0;
		left: 0;
	}
	tr { height: 22px; }
	td {
		padding: 0 3px;
		font-family: ui-monospace, monospace;
		font-size: 0.85em;
		line-height: 22px;
		height: 22px;
		box-sizing: border-box;
	}
	.offset { background-color: rgb(212, 210, 210); }
	.byte { background-color: rgb(246, 246, 246); }
	.byte input {
		width: 1.8em;
		padding: 0;
		border: 1px solid transparent;
		background: transparent;
		font-family: inherit;
		font-size: inherit;
		text-align: center;
	}
	.byte input:hover { border-color: #ccc; background: white; }
	.byte input:focus {
		border-color: #c63;
		background: white;
		outline: 1px solid #f1c789;
	}
</style>
