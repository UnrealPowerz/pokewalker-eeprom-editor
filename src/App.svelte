<script lang="ts">
	import Folder from './lib/Folder.svelte';
	import FileDrop from './lib/FileDrop.svelte';
	import { loadEeprom } from './pokewalker/load-eeprom';

	type Eeprom = Awaited<ReturnType<typeof loadEeprom>>;

	let eepromPromise = $state<Promise<Eeprom> | null>(null);

	const handleFile = (bufferPromise: Promise<ArrayBuffer>) => {
		eepromPromise = bufferPromise.then(loadEeprom);
	};
</script>

<FileDrop onfile={handleFile} />

{#if eepromPromise}
	{#await eepromPromise}
		<p>...waiting</p>
	{:then eeprom}
		<Folder data={eeprom as unknown as Record<string, unknown>} />
	{:catch error}
		<p style="color: red">{error.message}</p>
	{/await}
{/if}
