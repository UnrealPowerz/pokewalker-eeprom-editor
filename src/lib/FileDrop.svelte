<script lang="ts">
	interface Props {
		onfile: (bufferPromise: Promise<ArrayBuffer>) => Promise<void>;
	}
	let { onfile }: Props = $props();
	let busy = $state(false);
	let err = $state<string | null>(null);

	const readFile = (file: File): Promise<ArrayBuffer> =>
		new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = (evt) => resolve(evt.target!.result as ArrayBuffer);
			reader.readAsArrayBuffer(file);
		});

	const dragEventGetFiles = (ev: DragEvent): File[] => {
		if (!ev.dataTransfer) return [];
		if (ev.dataTransfer.items) {
			return [...ev.dataTransfer.items]
				.filter((item) => item.kind === 'file')
				.map((item) => item.getAsFile())
				.filter((f): f is File => f !== null);
		}
		return [...ev.dataTransfer.files];
	};

	const fileSelected = async (file: File) => {
		busy = true;
		err = null;
		try {
			await onfile(readFile(file));
		} catch (e) {
			err = String(e);
			busy = false;
		}
	};

	const dragOverHandler = (ev: Event) => ev.preventDefault();

	const dropHandler = (ev: DragEvent) => {
		if (busy) return;
		ev.preventDefault();
		const files = dragEventGetFiles(ev);
		if (files.length === 1) fileSelected(files[0]);
	};

	const browseFile = (ev: Event) => {
		const files = (ev.target as HTMLInputElement).files;
		if (files && files.length === 1) fileSelected(files[0]);
	};

	const loadFromWeb = async () => {
		busy = true;
		err = null;
		try {
			const res = await fetch(
				'https://raw.githubusercontent.com/mamba2410/reverse-pokewalker/master/dumps/bin/64k-full-rom.bin',
			);
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
			await onfile(res.arrayBuffer());
		} catch (e) {
			err = String(e);
			busy = false;
		}
	};
</script>

<div id="overlay">
	<div id="overlay-box">
		{#if busy}
			<p>Loading…</p>
		{:else}
			<p>Drag &amp; drop EEPROM image here</p>
			<p>OR</p>
			<input type="file" onchange={browseFile} />
			<p>OR</p>
			<button onclick={loadFromWeb}>Load mamba2410's EEPROM image from GitHub</button>
			<p>
				<a href="https://github.com/mamba2410/reverse-pokewalker/blob/master/dumps/bin/64k-full-rom.bin"
					>(this one)</a
				>
			</p>
			{#if err}<p class="err">Load failed: {err}</p>{/if}
		{/if}
	</div>
</div>

<svelte:body ondrop={dropHandler} ondragover={dragOverHandler} />

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
		min-height: 300px;
		width: 350px;
		padding: 1em;
		border-radius: 5px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
	}
	.err {
		color: #c33;
		font-size: 0.85em;
		max-width: 100%;
		word-break: break-word;
		text-align: center;
	}
</style>
