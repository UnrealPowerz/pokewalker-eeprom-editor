<svelte:options immutable={true}/>
<script lang="ts">
	export let expanded = false;

	const toggle = () => {
		expanded = !expanded;
	}
</script>

<button class:expanded on:click={toggle}>
    {#if expanded}
    <span class="material-symbols-outlined">expand_more</span>
    {:else}
    <span class="material-symbols-outlined">chevron_right</span>
    {/if}
    <slot name="name"/>
</button>

{#if expanded}
	<slot name="content"/>
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