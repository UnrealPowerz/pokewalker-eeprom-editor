// Single source of truth for the loaded EEPROM.
//
// Storage shape:
//   - `bytes` is the canonical 64KB Uint8Array. Any UI that wants to display
//     a field reads from `parsed` (which is $derived from bytes). Any UI
//     that wants to edit a field calls `setField(path, value)` which updates
//     bytes, pushes an undo snapshot, and triggers reactivity.
//   - `originalBytes` is the bytes as they were on load — used to compute
//     `dirty` and to support a "revert" action.
//   - `history` is the undo stack (snapshots, capped at HISTORY_LIMIT).
//
// LocalStorage holds the current bytes + filename across page reloads.

import { format } from '../pokewalker/spec'
import { loadPokeEncoding } from '../pokewalker/poke-encoding'
import type { BinType, BArrayBinType, StructBinType } from '../util/bin'

const HISTORY_LIMIT = 50
const STORAGE_KEY = 'pw-eeprom-editor:dump-v1'
const DEBOUNCE_MS = 800

type ParsedEeprom = ReturnType<typeof format.read>

type Snapshot = {
    bytes: Uint8Array
    description: string
}

type State = {
    bytes: Uint8Array | null
    originalBytes: Uint8Array | null
    filename: string
    history: Snapshot[]
    historyIdx: number  // index of the CURRENT state in history; undo decrements, redo increments
}

const empty = (): State => ({
    bytes: null,
    originalBytes: null,
    filename: '',
    history: [],
    historyIdx: -1,
})

const state = $state<State>(empty())

/** The current parsed EEPROM tree, or null if no dump is loaded. */
export const parsed = (): ParsedEeprom | null => {
    if (!state.bytes) return null
    const view = new DataView(state.bytes.buffer, state.bytes.byteOffset, state.bytes.byteLength)
    return format.read(view, 0)
}

export const filename = () => state.filename
export const isLoaded = () => state.bytes !== null
export const canUndo = () => state.historyIdx > 0
export const canRedo = () => state.historyIdx < state.history.length - 1
export const dirty = () => {
    if (!state.bytes || !state.originalBytes) return false
    if (state.bytes.length !== state.originalBytes.length) return true
    for (let i = 0; i < state.bytes.length; i++) {
        if (state.bytes[i] !== state.originalBytes[i]) return true
    }
    return false
}

// ---- Loading -------------------------------------------------------------

export const loadEeprom = async (buffer: ArrayBuffer, name = '') => {
    await loadPokeEncoding()
    // Always pad to a full 0x10000 — short dumps get 0xFF-filled to match
    // factory-fresh EEPROM defaults.
    const bytes = new Uint8Array(0x10000)
    bytes.fill(0xff)
    bytes.set(new Uint8Array(buffer).subarray(0, 0x10000))

    state.bytes = bytes
    state.originalBytes = new Uint8Array(bytes)  // copy
    state.filename = name
    state.history = [{ bytes: new Uint8Array(bytes), description: 'loaded' }]
    state.historyIdx = 0
    persistSoon()
}

/**
 * Compute the byte offset of every field in the spec, keyed by path string
 * (joined by `.`). Used by setField/getField to translate paths to byte
 * positions without re-walking the tree on every call.
 */
const buildOffsetTable = (): Map<string, { offset: number; spec: BinType<unknown> }> => {
    const table = new Map<string, { offset: number; spec: BinType<unknown> }>()
    walkSpec(format as unknown as BinType<unknown>, 0, [], table)
    return table
}

// Refine the spec to a duck-typed shape (just the introspection fields we
// need). BinType<T> is invariant so a direct StructBinType<...> / BArrayBinType<...>
// in the predicate output collides with the BinType<unknown> input.
type StructLike = BinType<unknown> & { _fields: Record<string, BinType<unknown>> }
type BArrayLike = BinType<unknown> & { _arrayLength: number; _arrayElem: BinType<unknown> }
const isStruct = (s: BinType<unknown>): s is StructLike => '_fields' in s
const isBArray = (s: BinType<unknown>): s is BArrayLike =>
    '_arrayLength' in s && '_arrayElem' in s

const walkSpec = (
    spec: BinType<unknown>,
    offset: number,
    path: (string | number)[],
    out: Map<string, { offset: number; spec: BinType<unknown> }>,
) => {
    const key = path.join('.')
    out.set(key, { offset, spec })

    if (isStruct(spec)) {
        let off = offset
        for (const [name, sub] of Object.entries(spec._fields)) {
            walkSpec(sub, off, [...path, name], out)
            off += sub.length
        }
    } else if (isBArray(spec)) {
        for (let i = 0; i < spec._arrayLength; i++) {
            walkSpec(spec._arrayElem, offset + i * spec._arrayElem.length, [...path, i], out)
        }
    }
}

// Lazy offset table — built on first load.
let offsetTable: ReturnType<typeof buildOffsetTable> | null = null

/**
 * Get the byte offset for a path into the spec, e.g.
 * ['reliableSaves', 'important1', 'identity', 'trainerTid'].
 * Returns null if the path doesn't resolve.
 */
export const getOffsetForPath = (path: (string | number)[]): { offset: number; spec: BinType<unknown> } | null => {
    if (!offsetTable) offsetTable = buildOffsetTable()
    return offsetTable.get(path.join('.')) ?? null
}

// ---- Mutations ------------------------------------------------------------

/**
 * Apply a write to a specific field path. Captures an undo snapshot before
 * mutating so the change can be reverted.
 *
 * The value is whatever the field's BinType.write expects. For simple
 * scalars that's a number/string; for sprites it's the SpriteValue object;
 * etc. Callers are responsible for assembling the correct value shape — the
 * editor UI does this via path-aware components.
 */
export const setField = (path: (string | number)[], value: unknown, description?: string) => {
    if (!state.bytes) return
    const entry = getOffsetForPath(path)
    if (!entry) {
        console.warn(`setField: path not found: ${path.join('.')}`)
        return
    }
    const view = new DataView(state.bytes.buffer, state.bytes.byteOffset, state.bytes.byteLength)
    entry.spec.write(view, entry.offset, value)
    // Mutate the typed-array in place — Svelte's $state on the Uint8Array
    // doesn't auto-trigger on indexed writes, so we reassign to force the
    // dependents to re-derive.
    state.bytes = state.bytes  // trigger reactivity
    pushHistory(description ?? `edit ${path.join('.')}`)
    persistSoon()
}

/**
 * Apply a write to a specific byte range. Useful for the Raw / HexView tabs
 * where mutations are byte-level rather than field-level.
 */
export const setBytes = (offset: number, value: ArrayLike<number>, description?: string) => {
    if (!state.bytes) return
    for (let i = 0; i < value.length; i++) {
        state.bytes[offset + i] = value[i]
    }
    state.bytes = state.bytes  // trigger reactivity
    pushHistory(description ?? `edit bytes @0x${offset.toString(16)}`)
    persistSoon()
}

// ---- Undo/redo ------------------------------------------------------------

const pushHistory = (description: string) => {
    if (!state.bytes) return
    // Trim any "redo" branch — if we undid and then made a new change, the
    // forward history is discarded.
    state.history = state.history.slice(0, state.historyIdx + 1)
    state.history.push({ bytes: new Uint8Array(state.bytes), description })
    if (state.history.length > HISTORY_LIMIT) {
        state.history = state.history.slice(state.history.length - HISTORY_LIMIT)
    }
    state.historyIdx = state.history.length - 1
}

export const undo = () => {
    if (!canUndo()) return
    state.historyIdx -= 1
    const snap = state.history[state.historyIdx]
    state.bytes = new Uint8Array(snap.bytes)
    persistSoon()
}

export const redo = () => {
    if (!canRedo()) return
    state.historyIdx += 1
    const snap = state.history[state.historyIdx]
    state.bytes = new Uint8Array(snap.bytes)
    persistSoon()
}

// ---- Download -------------------------------------------------------------

export const downloadBin = () => {
    if (!state.bytes) return
    const blob = new Blob([state.bytes as BlobPart], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = state.filename || 'eeprom.bin'
    a.click()
    URL.revokeObjectURL(url)
}

// ---- localStorage persistence ---------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null

const persistSoon = () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(persistNow, DEBOUNCE_MS)
}

const persistNow = () => {
    if (!state.bytes) {
        try { localStorage.removeItem(STORAGE_KEY) } catch {}
        return
    }
    try {
        // Base64 encode the bytes — much shorter than JSON arrays.
        let bin = ''
        for (let i = 0; i < state.bytes.length; i++) {
            bin += String.fromCharCode(state.bytes[i])
        }
        const data = {
            v: 1,
            filename: state.filename,
            bytes: btoa(bin),
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
        console.warn('persistNow failed:', e)
    }
}

/**
 * Try to restore the previously-loaded dump from localStorage. Returns true
 * if a dump was restored. Call once at app startup.
 */
export const tryRestore = async (): Promise<boolean> => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return false
        const data = JSON.parse(raw)
        if (data.v !== 1 || typeof data.bytes !== 'string') return false
        const bin = atob(data.bytes)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        await loadEeprom(bytes.buffer, data.filename ?? '')
        return true
    } catch (e) {
        console.warn('tryRestore failed:', e)
        return false
    }
}

export const clearPersisted = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
}
