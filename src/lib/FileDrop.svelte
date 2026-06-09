<script lang="ts">
	interface Props {
		onfile: (bufferPromise: Promise<ArrayBuffer>) => void;
	}
	let { onfile }: Props = $props();
	let overlay = $state(true);

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

	const fileSelected = (file: File) => {
		overlay = false;
		onfile(readFile(file));
	};

	const dragOverHandler = (ev: Event) => ev.preventDefault();

	const dropHandler = (ev: DragEvent) => {
		ev.preventDefault();
		const files = dragEventGetFiles(ev);
		if (files.length === 1) fileSelected(files[0]);
	};

	const browseFile = (ev: Event) => {
		const files = (ev.target as HTMLInputElement).files;
		if (files && files.length === 1) fileSelected(files[0]);
	};

	const loadFromWeb = async () => {
		overlay = false;
		const file = await fetch(
			'https://raw.githubusercontent.com/mamba2410/reverse-pokewalker/master/dumps/bin/64k-full-rom.bin',
		);
		onfile(file.arrayBuffer());
	};
</script>

{#if overlay}
	<div id="overlay">
		<div id="overlay-box">
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
		</div>
	</div>
{/if}

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
		height: 300px;
		width: 350px;
		border-radius: 5px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
	}
</style>
