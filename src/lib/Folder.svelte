<script lang="ts">
	import Entry from './Entry.svelte';

	interface Props {
		data: Record<string, unknown>;
		path?: (string | number)[];
	}
	let { data, path = [] }: Props = $props();
</script>

<ul>
	{#each Object.entries(data) as [childName, childValue]}
		<li>
			<Entry name={childName} value={childValue} path={[...path, /^\d+$/.test(childName) ? Number(childName) : childName]} />
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
