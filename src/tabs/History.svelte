<script lang="ts">
	import { parsed } from '../state/eeprom.svelte'
	import { getAtPath } from '../state/path'
	import { lookupEventType, formatEventTime } from '../pokewalker/event-log-types'

	interface EnumVal { _data: number; _annotate: string; _type: 'enum' }
	interface PokeStrVal { _data: string; _type: 'pokestring' }
	interface PokeSummary { species: EnumVal; level: number }
	interface ItemEntry { item: EnumVal; unused: number }

	interface EventLogEntry {
		eventTime: number
		peerInfo1: number
		peerInfo2: number
		walkingPokeSpecies: EnumVal
		otherPokeSpecies: EnumVal
		extraData: number
		pokeNick: PokeStrVal
		remPokeNick: PokeStrVal
		routeName: PokeStrVal
		routeImageIdx: number
		friendship: number
		sessionRecentSteps: number
		sessionSteps: number
		eventType: number
		walkingPokeFlags: number
		otherPokeFlags: number
	}

	const tree = $derived(parsed())

	const eventLog = $derived((getAtPath(tree, ['eventLog']) ?? []) as EventLogEntry[])
	const bookkeeping = $derived(getAtPath(tree, ['bookkeeping']) as Record<string, unknown> | undefined)
	const lastSyncTime = $derived(getAtPath(tree, ['reliableSaves', 'important1', 'identity', 'lastSyncTime']) as number | undefined)
	const stepCountAtSync = $derived(getAtPath(tree, ['reliableSaves', 'important1', 'identity', 'stepCount']) as number | undefined)

	// stepsHistory[7] — Int32ub each. Index 0 is the most recent day per
	// pw_firm convention; we'll show 6→0 as oldest→newest.
	const stepsHistory = $derived((bookkeeping?.stepsHistory ?? []) as number[])
	const maxSteps = $derived(Math.max(1, ...stepsHistory))

	const caughtPokes = $derived((bookkeeping?.caughtPokes ?? []) as PokeSummary[])
	const dowsedItems = $derived((bookkeeping?.dowsedItems ?? []) as ItemEntry[])
	const giftedItems = $derived((bookkeeping?.giftedItems ?? []) as ItemEntry[])
	const wattsForRemote = $derived((bookkeeping?.wattsForRemote ?? 0) as number)
	const giveStarf = $derived((bookkeeping?.giveStarf ?? 0) as number)

	// Filter out "empty" log entries — eventType 0 means a slot the firmware
	// hasn't written yet (or was reserved as a tombstone). Sort newest first
	// by sessionSteps as a proxy for chronology (eventTime epoch is opaque).
	const populatedEvents = $derived.by(() => {
		const out: { entry: EventLogEntry; slot: number }[] = []
		for (let i = 0; i < eventLog.length; i++) {
			const e = eventLog[i]
			if (!e) continue
			if (e.eventType === 0 || e.eventType === 0xFF) continue
			out.push({ entry: e, slot: i })
		}
		out.sort((a, b) => b.entry.sessionSteps - a.entry.sessionSteps)
		return out
	})

	const isNonEmptyItem = (it: ItemEntry | undefined): boolean =>
		!!it && it.item._data !== 0 && it.item._data !== 0xFFFF
</script>

{#if !tree}
	<p>Load an EEPROM dump to see history.</p>
{:else}
	<section>
		<h2>Daily steps (last 7 days)</h2>
		<div class="step-chart">
			{#each [6, 5, 4, 3, 2, 1, 0] as i (i)}
				{@const v = stepsHistory[i] ?? 0}
				<div class="day">
					<div class="bar-wrap">
						<div class="bar" style:height={`${(v / maxSteps) * 100}%`} title={`${v.toLocaleString()} steps`}></div>
					</div>
					<div class="day-label">{i === 0 ? 'today' : `−${i}d`}</div>
					<div class="day-val">{v.toLocaleString()}</div>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2>This session</h2>
		<div class="bookkeeping">
			<div class="bk-item">
				<div class="bk-label">Caught</div>
				<div class="bk-list">
					{#each caughtPokes as poke, i (i)}
						{#if poke.species && poke.species._data !== 0 && poke.species._data !== 0xFFFF}
							<span class="chip">{poke.species._annotate} L{poke.level}</span>
						{/if}
					{/each}
					{#if caughtPokes.every((p) => !p.species || p.species._data === 0 || p.species._data === 0xFFFF)}
						<span class="empty-chip">none</span>
					{/if}
				</div>
			</div>
			<div class="bk-item">
				<div class="bk-label">Dowsed</div>
				<div class="bk-list">
					{#each dowsedItems as it, i (i)}
						{#if isNonEmptyItem(it)}
							<span class="chip">{it.item._annotate}</span>
						{/if}
					{/each}
					{#if !dowsedItems.some(isNonEmptyItem)}
						<span class="empty-chip">none</span>
					{/if}
				</div>
			</div>
			<div class="bk-item">
				<div class="bk-label">Gifted</div>
				<div class="bk-list">
					{#each giftedItems as it, i (i)}
						{#if isNonEmptyItem(it)}
							<span class="chip">{it.item._annotate}</span>
						{/if}
					{/each}
					{#if !giftedItems.some(isNonEmptyItem)}
						<span class="empty-chip">none</span>
					{/if}
				</div>
			</div>
			<div class="bk-item">
				<div class="bk-label">Watts pending sync</div>
				<div>{wattsForRemote}</div>
			</div>
			{#if giveStarf}
				<div class="bk-item">
					<div class="bk-label">STARF</div>
					<div>flagged ({giveStarf})</div>
				</div>
			{/if}
		</div>
	</section>

	<section>
		<h2>Last sync</h2>
		<div class="meta">
			Walker clock at last DS sync: {formatEventTime(lastSyncTime ?? 0)}
			(raw {lastSyncTime ?? 0})
			· {stepCountAtSync?.toLocaleString() ?? '?'} steps at sync
		</div>
	</section>

	<section>
		<h2>Event log ({populatedEvents.length} entries)</h2>
		{#if populatedEvents.length === 0}
			<p class="meta">No events logged yet.</p>
		{:else}
			<table class="events">
				<thead>
					<tr>
						<th>Slot</th>
						<th>When (RTC)</th>
						<th>Steps</th>
						<th>Event</th>
						<th>Walking poke</th>
						<th>Other poke</th>
						<th>Route</th>
					</tr>
				</thead>
				<tbody>
					{#each populatedEvents as { entry, slot } (slot)}
						{@const info = lookupEventType(entry.eventType)}
						{@const isCatch = info.kind === 'catch-wild' || info.kind === 'catch-special' || info.kind === 'fled' || info.kind === 'lost'}
						<tr class={`kind-${info.kind}`}>
							<td>{slot}</td>
							<td>{formatEventTime(entry.eventTime)}</td>
							<td>{entry.sessionSteps.toLocaleString()}</td>
							<td>{info.label}</td>
							<td>
								{entry.walkingPokeSpecies?._annotate ?? '—'}
								{#if entry.pokeNick?._data}<br/><small>"{entry.pokeNick._data}"</small>{/if}
							</td>
							<td>
								{#if isCatch && entry.otherPokeSpecies?._data}
									{entry.otherPokeSpecies._annotate}
								{:else if entry.remPokeNick?._data}
									<small>"{entry.remPokeNick._data}"</small>
								{:else}
									—
								{/if}
							</td>
							<td>
								{#if entry.routeName?._data}
									<small>{entry.routeName._data}</small>
								{:else}
									—
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
{/if}

<style>
	section { margin-bottom: 1.5em; }
	h2 {
		margin: 0 0 0.5em 0; font-size: 1.05em; color: #222;
		border-bottom: 1px solid #ddd; padding-bottom: 0.2em;
	}
	.meta { color: #555; font-size: 0.9em; }

	.step-chart {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.4em;
		max-width: 36em;
		height: 12em;
	}
	.day { display: flex; flex-direction: column; align-items: center; gap: 0.2em; }
	.bar-wrap {
		flex: 1; width: 100%;
		display: flex; align-items: flex-end;
		background: #f3f3f3; border-radius: 3px;
	}
	.bar { width: 100%; background: linear-gradient(180deg, #5a8bbf, #4477aa); border-radius: 3px 3px 0 0; min-height: 1px; }
	.day-label { font-size: 0.75em; color: #888; }
	.day-val { font-size: 0.7em; color: #444; font-family: ui-monospace, monospace; }

	.bookkeeping { display: grid; grid-template-columns: 8em 1fr; gap: 0.3em 1em; }
	.bk-item { display: contents; }
	.bk-label { color: #666; font-size: 0.9em; }
	.bk-list { display: flex; flex-wrap: wrap; gap: 0.3em; }
	.chip {
		background: #e8f0f8; color: #225;
		padding: 0.1em 0.5em; border-radius: 10px; font-size: 0.85em;
	}
	.empty-chip { color: #888; font-style: italic; font-size: 0.85em; }

	.events { width: 100%; border-collapse: collapse; font-size: 0.85em; }
	.events th, .events td { padding: 0.35em 0.6em; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
	.events th { color: #666; font-weight: normal; }
	.events small { color: #888; font-size: 0.85em; }
	.events tr.kind-catch-wild td:first-child { border-left: 3px solid #4a7; padding-left: calc(0.6em - 3px); }
	.events tr.kind-catch-special td:first-child { border-left: 3px solid #c63; padding-left: calc(0.6em - 3px); }
	.events tr.kind-dowse-found td:first-child { border-left: 3px solid #fa3; padding-left: calc(0.6em - 3px); }
	.events tr.kind-fled td:first-child,
	.events tr.kind-lost td:first-child { border-left: 3px solid #c33; padding-left: calc(0.6em - 3px); }
	.events tr.kind-session-start td:first-child { border-left: 3px solid #888; padding-left: calc(0.6em - 3px); }
	.events tr.kind-pedometer td:first-child { border-left: 3px solid #79c; padding-left: calc(0.6em - 3px); }
	.events tr.kind-unknown td:first-child { border-left: 3px solid #ccc; padding-left: calc(0.6em - 3px); }
</style>
