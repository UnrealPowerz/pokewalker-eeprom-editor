<script lang="ts">
	import { parsed } from '../state/eeprom.svelte'
	import { getAtPath } from '../state/path'

	interface EnumVal { _data: number; _annotate: string; _type: 'enum' }
	interface PokeStrVal { _data: string; _type: 'pokestring' }
	interface PokeSlot {
		species: EnumVal
		heldItem: EnumVal
		moves: EnumVal[]
		level: number
		nickname: PokeStrVal
	}
	interface PeerTeam {
		tid: number
		sid: number
		name: PokeStrVal
		pokes: PokeSlot[]
	}

	const tree = $derived(parsed())
	const peer = $derived(getAtPath(tree, ['peerData', 'peer']) as PeerTeam | undefined)
	const metPeers = $derived((getAtPath(tree, ['peerData', 'metPeers']) ?? []) as PeerTeam[])

	const isPopulated = (p: PeerTeam | undefined): boolean => {
		if (!p) return false
		if (p.name?._data && p.name._data.trim().length > 0) return true
		if (p.tid !== 0 || p.sid !== 0) return true
		return (p.pokes ?? []).some((pk) => pk?.species && pk.species._data !== 0 && pk.species._data !== 0xFFFF)
	}
</script>

{#snippet peerCard(p: PeerTeam | undefined, label: string)}
	{@const populated = isPopulated(p)}
	<div class="card" class:empty={!populated}>
		<div class="head">
			<span class="slot">{label}</span>
			{#if populated && p}
				<span class="name">{p.name?._data || '(unnamed)'}</span>
				<span class="ids">TID {p.tid} / SID {p.sid}</span>
			{:else}
				<span class="empty-label">(empty slot)</span>
			{/if}
		</div>
		{#if populated && p}
			<ol class="team">
				{#each p.pokes as poke, i (i)}
					{@const filled = poke?.species && poke.species._data !== 0 && poke.species._data !== 0xFFFF}
					<li class:filled>
						{#if filled}
							<span class="sp">{poke.species._annotate}</span>
							<span class="lvl">L{poke.level}</span>
							{#if poke.nickname?._data && poke.nickname._data !== poke.species._annotate}
								<span class="nick">"{poke.nickname._data}"</span>
							{/if}
							{#if poke.heldItem && poke.heldItem._data !== 0}
								<span class="item">@ {poke.heldItem._annotate}</span>
							{/if}
						{:else}
							<span class="dash">—</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</div>
{/snippet}

{#if !tree}
	<p>Load an EEPROM dump to see peers.</p>
{:else}
	<section>
		<h2>Current peer</h2>
		<p class="hint">
			The walker's most recent peer connection — staged here during the
			handshake and read back when comparing teams for trainer-house battle.
		</p>
		{@render peerCard(peer, 'peer')}
	</section>

	<section>
		<h2>Met peers ({metPeers.filter(isPopulated).length}/{metPeers.length})</h2>
		<p class="hint">
			Ring buffer of the last 10 walkers shaken hands with. New peers overwrite
			the oldest slot — the order isn't strictly chronological once full.
		</p>
		<div class="grid">
			{#each metPeers as p, i (i)}
				{@render peerCard(p, `#${i}`)}
			{/each}
		</div>
	</section>
{/if}

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.4em 0; font-size: 1.05em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
	}
	.hint { color: #666; font-size: 0.85em; margin: 0 0 0.7em; }

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.7em;
	}
	.card {
		padding: 0.6em 0.7em;
		background: #fafafa;
		border: 1px solid #eee;
		border-radius: 4px;
	}
	.card.empty { opacity: 0.4; }
	.head {
		display: flex; align-items: baseline; gap: 0.6em; flex-wrap: wrap;
		padding-bottom: 0.3em; margin-bottom: 0.4em;
		border-bottom: 1px solid #eee;
	}
	.slot { font-family: ui-monospace, monospace; color: #999; font-size: 0.85em; }
	.name { font-weight: bold; color: #222; }
	.ids { color: #666; font-family: ui-monospace, monospace; font-size: 0.8em; }
	.empty-label { color: #888; font-style: italic; font-size: 0.85em; }

	.team {
		list-style: none; padding: 0; margin: 0;
		display: grid; gap: 0.15em;
	}
	.team li {
		display: flex; align-items: baseline; gap: 0.4em;
		font-size: 0.85em;
		padding: 0.1em 0;
	}
	.team li.filled { color: #222; }
	.team li:not(.filled) .dash { color: #ccc; }
	.sp { font-weight: 500; }
	.lvl { color: #4477aa; font-family: ui-monospace, monospace; font-size: 0.85em; }
	.nick { color: #888; font-style: italic; }
	.item { color: #666; font-size: 0.85em; }
</style>
