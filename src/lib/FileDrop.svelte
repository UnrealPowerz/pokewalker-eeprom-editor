<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let overlay = true

	const dispatch = createEventDispatcher();

    function readFile(file: any) {
        return new Promise(r => {
            const reader = new FileReader()
            reader.onload = (evt: ProgressEvent<FileReader>) => {
                r(evt.target!.result as ArrayBuffer)
            };
            reader.readAsArrayBuffer(file);
        })
    }

    function dragOverHandler(ev: Event) {
        ev.preventDefault();
    }


    function dragEventGetFiles(ev: DragEvent) {
        if (ev.dataTransfer!.items) {
            return [...ev.dataTransfer!.items]
                .filter(item => item.kind === 'file')
                .map(item => item.getAsFile())
    } else {
        return [...ev.dataTransfer!.files]
    }
    }

    function dropHandler(ev: DragEvent) {
        ev.preventDefault();

        const files = dragEventGetFiles(ev)
        if (files.length === 1) {
            fileSelected(files[0])
        }
    }

    function browseFile(evt: Event) {
        const files = (evt.target as any).files
        if (files.length === 1) {
            fileSelected(files[0])
        }
    }

    function fileSelected(file: any) {
        overlay = false
        dispatch('file', readFile(file))
    }

    async function loadFromWeb() {
        overlay = false
        const file = await fetch('https://raw.githubusercontent.com/mamba2410/reverse-pokewalker/master/dumps/bin/64k-full-rom.bin')
        dispatch('file', file.arrayBuffer())
    }
</script>

{#if overlay}
<div id="overlay">
    <div id="overlay-box">
        <p>Drag &amp; drop EEPROM image here</p>
        <p>OR</p>
        <input type="file" on:change={browseFile}>
        <p>OR</p>
        <button on:click={loadFromWeb}>Load mamba2410's EEPROM image from GitHub</button>
        <p><a href="https://github.com/mamba2410/reverse-pokewalker/blob/master/dumps/bin/64k-full-rom.bin">(this one)</a></p>
    </div>
</div>
{/if}

<svelte:body on:drop={dropHandler} on:dragover={dragOverHandler}/>

<style>
    #overlay {
        position: fixed;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: white;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    #overlay-box {
        border: 1px dashed black;
        height: 300px;
        width: 350px;
        border-radius: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
    }
</style>