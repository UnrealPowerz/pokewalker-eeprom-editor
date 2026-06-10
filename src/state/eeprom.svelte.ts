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
import { buildExport } from '../pokewalker/json-export'
import { parseImport } from '../pokewalker/json-import'
import { syncReliable } from '../pokewalker/reliable'
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

export const rawBytes = (): Uint8Array | null => state.bytes
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

export const loadEeprom = async (buffer: ArrayBufferLike, name = '') => {
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

const isLeaf = (s: BinType<unknown>): boolean => !isStruct(s) && !isBArray(s)

/**
 * Get the byte offset for a path into the spec, e.g.
 * ['reliableSaves', 'important1', 'identity', 'trainerTid'].
 * Returns null if the path doesn't resolve.
 */
export const getOffsetForPath = (path: (string | number)[]): { offset: number; spec: BinType<unknown> } | null => {
    if (!offsetTable) offsetTable = buildOffsetTable()
    return offsetTable.get(path.join('.')) ?? null
}

// ---- Changes diff ---------------------------------------------------------

export type ChangeEntry = {
    pathKey: string
    path: (string | number)[]
    before: unknown
    after: unknown
    offset: number
    length: number
}

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

const valuesEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (a instanceof Uint8Array && b instanceof Uint8Array) return bytesEqual(a, b)
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const ar = a as Record<string, unknown>
        const br = b as Record<string, unknown>
        // Wrapped values (poke string, sprite, enum) all carry _raw / data / _data
        // we can compare directly.
        if (ar._type === 'pokestring' && br._type === 'pokestring') {
            return bytesEqual(ar._raw as Uint8Array, br._raw as Uint8Array)
        }
        if (ar._type === 'sprite' && br._type === 'sprite') {
            return bytesEqual(ar.data as Uint8Array, br.data as Uint8Array)
        }
        if (ar._type === 'enum' && br._type === 'enum') {
            return ar._data === br._data
        }
    }
    return false
}

/**
 * Walk every leaf field and return entries whose value differs between two
 * EEPROM byte buffers. Used both for current-vs-load (the Changes tab) and
 * current-vs-another-dump (the Compare tab).
 *
 * The returned entries' `before`/`after` fields correspond to the first
 * and second argument respectively, so call diffBuffers(original, current)
 * to read "before" as the original and "after" as the current.
 */
export const diffBuffers = (a: Uint8Array, b: Uint8Array): ChangeEntry[] => {
    if (!offsetTable) offsetTable = buildOffsetTable()
    const aView = new DataView(a.buffer, a.byteOffset, a.byteLength)
    const bView = new DataView(b.buffer, b.byteOffset, b.byteLength)
    const out: ChangeEntry[] = []
    for (const [pathKey, { offset, spec }] of offsetTable) {
        if (!isLeaf(spec)) continue
        if (pathKey === '') continue
        const before = spec.read(aView, offset)
        const after = spec.read(bView, offset)
        if (valuesEqual(before, after)) continue
        out.push({
            pathKey,
            path: pathKey.split('.').map((seg) => /^\d+$/.test(seg) ? Number(seg) : seg),
            before, after, offset, length: spec.length,
        })
    }
    return out
}

/**
 * Return every leaf field whose value differs between the originally-loaded
 * bytes and the current bytes.
 */
export const getChanges = (): ChangeEntry[] => {
    if (!state.bytes || !state.originalBytes) return []
    return diffBuffers(state.originalBytes, state.bytes)
}

/**
 * Revert one field back to its original loaded value, going through
 * setField so reliable-save mirroring still runs.
 */
export const revertField = (path: (string | number)[]): void => {
    if (!state.originalBytes) return
    const entry = getOffsetForPath(path)
    if (!entry) return
    const view = new DataView(state.originalBytes.buffer, state.originalBytes.byteOffset, state.originalBytes.byteLength)
    const originalValue = entry.spec.read(view, entry.offset)
    setField(path, originalValue, `revert ${path.join('.')}`)
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
    // Keep reliable-save regions consistent: mirror primary↔backup and
    // recompute the trailing checksum byte. Nice-UI tabs always go through
    // here so they can't produce a dump the walker would refuse.
    syncReliable(state.bytes, entry.offset, entry.spec.length)
    state.bytes = new Uint8Array(state.bytes.buffer)
    pushHistory(description ?? `edit ${path.join('.')}`)
    persistSoon()
}

/**
 * Raw field write. Same path resolution as setField but DOES NOT mirror
 * to reliable backups or recompute reliable checksums — the Raw tab's
 * escape hatch for crafting intentionally broken dumps.
 */
export const setFieldRaw = (path: (string | number)[], value: unknown, description?: string) => {
    if (!state.bytes) return
    const entry = getOffsetForPath(path)
    if (!entry) return
    const view = new DataView(state.bytes.buffer, state.bytes.byteOffset, state.bytes.byteLength)
    entry.spec.write(view, entry.offset, value)
    state.bytes = new Uint8Array(state.bytes.buffer)
    pushHistory(description ?? `raw edit ${path.join('.')}`)
    persistSoon()
}

/**
 * Raw single-byte write. Doesn't sync reliable saves; used by the Raw
 * tab's hex editor for direct byte poking.
 */
export const setByteRaw = (offset: number, value: number, description?: string) => {
    if (!state.bytes) return
    if (offset < 0 || offset >= state.bytes.length) return
    state.bytes[offset] = value & 0xFF
    state.bytes = new Uint8Array(state.bytes.buffer)
    pushHistory(description ?? `raw byte @0x${offset.toString(16)}`)
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
    state.bytes = new Uint8Array(state.bytes.buffer)
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
    triggerDownload(blob, state.filename || 'eeprom.bin')
}

/**
 * Load from a JSON export. Returns null on success, error string on failure.
 */
export const loadJsonExport = async (text: string): Promise<string | null> => {
    const result = parseImport(text)
    if (!result.ok) return result.error
    await loadEeprom(result.bytes.buffer, result.filename || 'imported.bin')
    return null
}

export const downloadJson = () => {
    if (!state.bytes) return
    const p = parsed()
    const payload = buildExport(state.bytes, state.filename, p)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const base = (state.filename || 'eeprom.bin').replace(/\.bin$/i, '')
    triggerDownload(blob, `${base}.json`)
}

const triggerDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
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
