// Mapping of eventType codes used in eventLog entries to human-readable
// labels. Codes are derived from game_log_interaction() call sites in
// pw_firm (src/game/{walk,pedometer,bored_gift,minigames/{dowsing,battle}}.c
// and src/ui/event_reward.c). Unknown codes get a fallback "Event N".

export type EventKind =
    | 'dowse-found' | 'dowse-discard'
    | 'catch-wild' | 'catch-special' | 'fled' | 'lost'
    | 'session-start' | 'pedometer'
    | 'reward-item' | 'reward-poke'
    | 'gift'
    | 'unknown'

export type EventInfo = {
    label: string
    kind: EventKind
}

export const EVENT_TYPE_INFO: Record<number, EventInfo> = {
    0x0B: { label: 'Dowsing — found', kind: 'dowse-found' },
    0x0C: { label: 'Dowsing — discard', kind: 'dowse-discard' },
    0x0D: { label: 'Caught wild Pokémon', kind: 'catch-wild' },
    0x0E: { label: 'Caught event Pokémon', kind: 'catch-special' },
    0x0F: { label: 'Pokémon fled', kind: 'fled' },
    0x10: { label: 'Battle lost', kind: 'lost' },
    0x19: { label: 'Session start', kind: 'session-start' },
    0x1B: { label: 'Step milestone', kind: 'pedometer' },
    0x1C: { label: 'Event reward — item', kind: 'reward-item' },
    0x1D: { label: 'Event reward — Pokémon', kind: 'reward-poke' },
}

export const lookupEventType = (code: number): EventInfo => {
    const hit = EVENT_TYPE_INFO[code]
    if (hit) return hit
    // bored_gift uses type+16 (0x10..) for gift sub-events. Treat 0x11..0x18
    // as gift variants.
    if (code >= 0x11 && code <= 0x18) {
        return { label: `Gift type ${code - 0x10}`, kind: 'gift' }
    }
    return { label: `Event 0x${code.toString(16).toUpperCase()}`, kind: 'unknown' }
}

// Format an eventTime (seconds, raw u32 with no known epoch) as a
// readable duration. Walker RTC counts seconds from an opaque start point —
// we present it as a days/hours/minutes breakdown for browsing.
export const formatEventTime = (secs: number): string => {
    if (secs === 0 || secs === 0xFFFFFFFF) return '—'
    const days = Math.floor(secs / 86400)
    const hours = Math.floor((secs % 86400) / 3600)
    const mins = Math.floor((secs % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
}
