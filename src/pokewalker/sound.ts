// Pokéwalker note-sequence parser.
//
// Each of the 16 sounds is a stream of (b0, b1) pairs. b1 holds a 7-bit
// "code" plus a top-bit "tied" flag; b0 is the duration multiplier (or
// tempo value for the TEMPO control marker).
//
// Duration in seconds = (D_CONSTANT * b0 / tempo) / clock
// The period factor cancels because Timer-W's per-tick wall-clock time is
// period/clock, so total seconds = d / clock — i.e. pitch and tempo are
// linked through the same clock.

// From pw_firm src/romdata.c SOUND_PERIOD_TABLE[42]. Smaller = higher pitch.
export const PERIOD_TABLE = [
    244, 230, 217, 205, 194, 183, 172, 163, 154, 145, 137, 129,
    122, 115, 108, 102,  97,  91,  86,  81,  77,  72,  68,  64,
     61,  57,  54,  51,  48,  45,  43,  40,  38,  36,  34,  32,
     30,  28,  26,  25,  23,  22,
]

export const DEFAULT_TEMPO = 0x78
export const D_CONSTANT = 0x14000
export const SEPARATE_NOTE_GAP_D = 0x140

// Control markers, after stripping the tied flag (b1 & 0x7F).
export const TOK_TEMPO = 0x7B
export const TOK_REST = 0x7D
export const TOK_SCRATCH = 0x7E   // jump-to-RAM; treat as end for playback
export const TOK_END = 0x7F

// From pw_firm gfx_consts.h SND_*.
export const SND_NAMES = [
    'SND_CONFIRM',      'SND_BACK',         'SND_CURSOR',       'SND_RADAR_LOCK',
    'SND_FAIL',         'SND_DOWSE_HIT',    'SND_ANIM_CUE',     'SND_FANFARE',
    '(unused 8)',       'SND_GIFT',         'SND_BATTLE_START', 'SND_ATTACK_HIT',
    'SND_ATTACK_MISS',  'SND_CRIT_HIT',     'SND_FLED',         'SND_BALL_THROW',
] as const

export const DIRECTORY_OFFSET = 0x8CB0
export const POOL_OFFSET = 0x8CF0
export const ENTRY_COUNT = 16
export const MAX_ENTRY_LEN = 0xC0

export type SoundEvent =
    | { type: 'note'; freq: number; durationSec: number; gapSec: number }
    | { type: 'rest'; durationSec: number }
    | { type: 'err'; msg: string }

export type ParsedSequence = {
    events: SoundEvent[]
    noteCount: number
}

export const parseNoteSequence = (data: Uint8Array, clockHz: number): ParsedSequence => {
    const events: SoundEvent[] = []
    let i = 0
    let tempo = DEFAULT_TEMPO
    let safety = 0
    while (i + 1 < data.length) {
        if (++safety > 500) {
            events.push({ type: 'err', msg: 'too many notes (loop?)' })
            break
        }
        const b0 = data[i]
        const b1 = data[i + 1]
        const code = b1 & 0x7F
        const tied = (b1 & 0x80) !== 0

        if (code === TOK_END || code === TOK_SCRATCH) break
        if (code === TOK_TEMPO) {
            tempo = b0 || DEFAULT_TEMPO
            i += 2
            continue
        }

        const dRaw = (D_CONSTANT * b0) / tempo
        const totalSec = dRaw / clockHz
        const gapSec = SEPARATE_NOTE_GAP_D / clockHz

        if (code === TOK_REST) {
            events.push({ type: 'rest', durationSec: totalSec })
            i += 2
            continue
        }

        if (code >= PERIOD_TABLE.length) {
            events.push({ type: 'err', msg: `unknown code 0x${code.toString(16)} at +${i}, skipping` })
            i += 2
            continue
        }

        const period = PERIOD_TABLE[code]
        const freq = clockHz / period

        if (tied) {
            events.push({ type: 'note', freq, durationSec: totalSec, gapSec: 0 })
        } else {
            events.push({
                type: 'note', freq,
                durationSec: Math.max(0, totalSec - gapSec),
                gapSec,
            })
        }
        i += 2
    }
    const noteCount = events.filter((e) => e.type === 'note').length
    return { events, noteCount }
}

// Raw event model — preserves the on-wire (b0, b1) so we can round-trip.
// Used by the composer; the playback layer (parseNoteSequence) projects
// these into wall-clock seconds.
export type RawEvent =
    | { type: 'note'; code: number; b0: number; tied: boolean }   // code is index into PERIOD_TABLE (0..41)
    | { type: 'rest'; b0: number }
    | { type: 'tempo'; b0: number }                                // sets current tempo to b0 (0 → DEFAULT_TEMPO)

export type ParsedRaw = {
    events: RawEvent[]
    // b1 of the terminator (TOK_END or TOK_SCRATCH) and its b0 byte.
    // Walker ignores b0 here, but we preserve it for byte-exact round-trip.
    terminator: { b0: number; b1: number }
}

/**
 * Parse a sound entry into raw events. Stops at — but records — the
 * TOK_END / TOK_SCRATCH terminator so encodeRaw can recreate the exact
 * byte sequence.
 */
export const parseRaw = (data: Uint8Array): ParsedRaw => {
    const out: RawEvent[] = []
    let terminator = { b0: 0x00, b1: TOK_END }
    let i = 0
    while (i + 1 < data.length) {
        const b0 = data[i]
        const b1 = data[i + 1]
        const code = b1 & 0x7F
        const tied = (b1 & 0x80) !== 0

        if (code === TOK_END || code === TOK_SCRATCH) {
            terminator = { b0, b1 }
            break
        }
        if (code === TOK_TEMPO) {
            out.push({ type: 'tempo', b0 })
        } else if (code === TOK_REST) {
            out.push({ type: 'rest', b0 })
        } else if (code < PERIOD_TABLE.length) {
            out.push({ type: 'note', code, b0, tied })
        }
        // Unknown codes are dropped; the walker would read past the period
        // table into garbage memory so we can safely treat them as no-ops
        // when round-tripping (production dumps don't contain them).
        i += 2
    }
    return { events: out, terminator }
}

/**
 * Encode events back to (b0, b1) pairs followed by a terminator pair.
 * If you don't pass `terminator`, a fresh (0x00, TOK_END) is appended.
 */
export const encodeRaw = (events: RawEvent[], terminator?: { b0: number; b1: number }): Uint8Array => {
    const t = terminator ?? { b0: 0x00, b1: TOK_END }
    const out = new Uint8Array((events.length + 1) * 2)
    let i = 0
    for (const ev of events) {
        if (ev.type === 'note') {
            out[i++] = ev.b0 & 0xFF
            out[i++] = (ev.code & 0x7F) | (ev.tied ? 0x80 : 0)
        } else if (ev.type === 'rest') {
            out[i++] = ev.b0 & 0xFF
            out[i++] = TOK_REST
        } else if (ev.type === 'tempo') {
            out[i++] = ev.b0 & 0xFF
            out[i++] = TOK_TEMPO
        }
    }
    out[i++] = t.b0 & 0xFF
    out[i++] = t.b1 & 0xFF
    return out.subarray(0, i)
}

/**
 * Sum of bytes mod 256, matching how the walker validates a sample before
 * playing it.
 */
export const computeChecksum = (data: Uint8Array): number => {
    let sum = 0
    for (let i = 0; i < data.length; i++) sum = (sum + data[i]) & 0xFF
    return sum
}

export type SoundEntry = {
    index: number
    name: string
    offset: number      // offset from POOL start (little-endian u16 from directory)
    dataStart: number   // absolute offset into EEPROM
    length: number
    checksum: number
    data: Uint8Array
    valid: boolean      // length <= MAX_ENTRY_LEN
}

// Total pool size (POOL_OFFSET..0x8EFF inclusive).
export const POOL_SIZE = 0x8F00 - POOL_OFFSET

/**
 * Lay out 16 entries' data into the sound pool consecutively and update the
 * 16 directory entries (offset/length/checksum) accordingly.
 *
 * Mutates a *copy* of `bytes` and returns it. If the combined entry data
 * exceeds POOL_SIZE, returns null (caller should surface an error).
 *
 * The repack uses each entry's CURRENT directory position as its identity —
 * pass in `entries` derived from `readDirectory(bytes)` with one or more
 * `.data` fields swapped for newly-encoded content.
 */
export const repackPool = (bytes: Uint8Array, entries: SoundEntry[]): Uint8Array | null => {
    const totalLen = entries.reduce((s, e) => s + e.data.length, 0)
    if (totalLen > POOL_SIZE) return null

    const next = new Uint8Array(bytes)
    // Zero the pool first so any shrinkage leaves clean trailing bytes.
    next.fill(0, POOL_OFFSET, POOL_OFFSET + POOL_SIZE)

    let cursor = 0
    for (let i = 0; i < ENTRY_COUNT; i++) {
        const entry = entries[i]
        const data = entry.data
        const dirOff = DIRECTORY_OFFSET + i * 4
        // u16 LE offset (relative to POOL_OFFSET)
        next[dirOff] = cursor & 0xFF
        next[dirOff + 1] = (cursor >> 8) & 0xFF
        next[dirOff + 2] = data.length & 0xFF
        next[dirOff + 3] = computeChecksum(data)
        // Copy bytes into the pool.
        for (let j = 0; j < data.length; j++) {
            next[POOL_OFFSET + cursor + j] = data[j]
        }
        cursor += data.length
    }
    return next
}

export const readDirectory = (bytes: Uint8Array): SoundEntry[] => {
    const out: SoundEntry[] = []
    for (let i = 0; i < ENTRY_COUNT; i++) {
        const entryOff = DIRECTORY_OFFSET + i * 4
        // u16 LE despite firmware reading BE-then-byteswap — net result is LE.
        const offset = bytes[entryOff] | (bytes[entryOff + 1] << 8)
        const length = bytes[entryOff + 2]
        const checksum = bytes[entryOff + 3]
        const dataStart = POOL_OFFSET + offset
        const valid = length <= MAX_ENTRY_LEN
        const data = valid ? bytes.subarray(dataStart, dataStart + length) : new Uint8Array(0)
        out.push({
            index: i,
            name: SND_NAMES[i] ?? '?',
            offset, dataStart, length, checksum, data, valid,
        })
    }
    return out
}
