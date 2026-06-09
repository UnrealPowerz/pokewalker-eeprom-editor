<script lang="ts">
	interface Props {
		data: ArrayBuffer;
	}
	let { data }: Props = $props();

	const chunked = <T>(array: T[], chunkSize: number): T[][] => {
		const chunkedArray: T[][] = [];
		for (let i = 0; i < array.length; i += chunkSize) {
			chunkedArray.push(array.slice(i, i + chunkSize));
		}
		return chunkedArray;
	};

	const allTheSame = <T>(array: ArrayLike<T>): T | undefined => {
		if (array.length < 2) return undefined;
		const first = array[0];
		for (let i = 1; i < array.length; i++) {
			if (array[i] !== first) return undefined;
		}
		return first;
	};

	const hex = $derived(
		chunked(
			[...new Uint8Array(data)].map((x) => x.toString(16).padStart(2, '0')),
			16,
		),
	);
	const allByte = $derived(allTheSame(new Uint8Array(data)));
</script>

<div>
	{data.byteLength} bytes
	{#if allByte !== undefined}(all 0x{allByte.toString(16).padStart(2, '0')}){/if}
</div>
<table class="view">
	<tbody>
		{#each hex as bytes, i}
			<tr>
				<td class="offset">{(i * 16).toString(16).padStart(6, '0')}</td>
				{#each bytes as byte}
					<td class="byte">{byte}</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	td {
		padding: 2px 4px;
	}
	.view {
		display: inline-block;
		max-height: 200px;
		overflow-y: scroll;
		border-collapse: collapse;
	}
	.offset {
		background-color: rgb(212, 210, 210);
	}
	.byte {
		background-color: rgb(246, 246, 246);
	}
</style>
