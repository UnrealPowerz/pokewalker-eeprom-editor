<script lang="ts">
  import Folder from './lib/Folder.svelte'
  import { loadEeprom } from './pokewalker/load-eeprom'
  import FileDrop from './lib/FileDrop.svelte'
  
  let eepromPromise: Promise<any>

  const loadFromEvent = (evt: any) => {
    const bufferPromise = evt.detail as Promise<ArrayBuffer>
    eepromPromise = bufferPromise.then(buffer => loadEeprom(buffer))
  }
</script>

<FileDrop on:file={loadFromEvent}/>

{#if eepromPromise}
  {#await eepromPromise}
    <p>...waiting</p>
  {:then eeprom}
    <Folder children={eeprom}/>
  {:catch error}
    <p style="color: red">{error.message}</p>
  {/await}
{/if}


<style>

</style>