// Hand-authored starting patterns. Each preset is a sequence of RawEvents.
// The PianoRoll editor lets users load one and tweak from there.
//
// Code numbers index into PERIOD_TABLE. Lower = higher pitch.
//   0..11  = highest octave (≈G#7..G8 at clock 100kHz)
//  12..23  = next octave down
//  24..35  = next octave down
//  36..41  = lowest 6 notes
//
// Durations (b0): 16 ≈ short, 32 ≈ normal, 64 ≈ long, 128 ≈ very long.

import type { RawEvent } from './sound'

export type Preset = {
    name: string
    events: RawEvent[]
}

const note = (code: number, b0: number, tied = false): RawEvent =>
    ({ type: 'note', code, b0, tied })
const rest = (b0: number): RawEvent => ({ type: 'rest', b0 })

export const PRESETS: Preset[] = [
    {
        name: 'Ascending arpeggio',
        // C-E-G-C — a simple major triad arpeggio in the middle octave.
        events: [
            note(27, 24), note(23, 24), note(20, 24), note(15, 48),
        ],
    },
    {
        name: 'Confirm beep',
        // Short two-note rise — classic UI confirm.
        events: [
            note(24, 16), note(20, 32),
        ],
    },
    {
        name: 'Sad fail',
        // Descending three-note "wah-wah" with a long final.
        events: [
            note(16, 24), note(20, 24), note(24, 64),
        ],
    },
    {
        name: 'Alarm',
        // Alternating two-note alarm pattern.
        events: [
            note(12, 16), note(18, 16), note(12, 16), note(18, 16),
            note(12, 16), note(18, 16),
        ],
    },
    {
        name: 'Fanfare',
        // Triumphant 5-note rise with a held final.
        events: [
            note(28, 12), note(24, 12), note(20, 12), note(16, 24),
            rest(8),
            note(12, 64),
        ],
    },
    {
        name: 'Heartbeat',
        // Two low thumps with a gap.
        events: [
            note(38, 16), rest(8), note(38, 16), rest(96),
        ],
    },
]
