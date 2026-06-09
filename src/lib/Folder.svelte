<script lang="ts">
	import Entry from './Entry.svelte';

	interface Props {
		data: Record<string, unknown>;
	}
	let { data }: Props = $props();
</script>

<ul>
	{#each Object.entries(data) as [childName, childValue]}
		<li>
			<Entry name={childName} value={childValue} />
		</li>
	{/each}
</ul>

<style>
	ul {
		padding: 0.2em 0 0 0.5em;
		margin: 0 0 0 0.5em;
		list-style: none;
		border-left: 1px solid #eee;
	}

	li {
		padding: 0.2em 0;
	}
</style>
