<script lang="ts">
	import type { Snippet } from 'svelte';

	let { header, body }: { header?: Snippet, body?: Snippet } = $props();
	let expanded = $state(false);

	const toggle = () => {
		expanded = !expanded;
	}
</script>

<button class:expanded onclick={toggle}>
    {#if expanded}
    <span class="material-symbols-outlined">expand_more</span>
    {:else}
    <span class="material-symbols-outlined">chevron_right</span>
    {/if}
    {@render header?.()}
</button>

{#if expanded}
	{@render body?.()}
{/if}

<style>
	button {
        display: block;
		font-weight: bold;
		cursor: pointer;
		border: none;
		margin: 0;
        text-align: left;
	}
</style>
