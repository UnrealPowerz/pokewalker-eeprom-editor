<script lang="ts">
	import Folder from '../lib/Folder.svelte'
	import { parsed } from '../state/eeprom.svelte'

	const tree = $derived(parsed())
</script>

{#if tree}
	<Folder data={tree as unknown as Record<string, unknown>} />
{/if}
