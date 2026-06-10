// Parses a JSON export produced by json-export.ts back into a 64KB
// EEPROM image. The `bytes` field is canonical; `view` is informational.
// We decode `bytes` from base64 and return a Uint8Array, plus the
// declared filename so the store can restore it.

import { SCHEMA_VERSION } from './json-export'

export type ImportResult =
    | { ok: true; bytes: Uint8Array; filename: string }
    | { ok: false; error: string }

const base64ToU8 = (b64: string): Uint8Array => {
    const bin = atob(b64)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    return u8
}

export const parseImport = (text: string): ImportResult => {
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch (e) {
        return { ok: false, error: `not valid JSON: ${String(e)}` }
    }
    if (data == null || typeof data !== 'object') {
        return { ok: false, error: 'expected a JSON object at the top level' }
    }
    const obj = data as Record<string, unknown>

    const v = obj.schemaVersion
    if (typeof v !== 'number') {
        return { ok: false, error: 'missing schemaVersion field' }
    }
    if (v !== SCHEMA_VERSION) {
        return { ok: false, error: `schemaVersion ${v} not supported (expected ${SCHEMA_VERSION})` }
    }

    const b64 = obj.bytes
    if (typeof b64 !== 'string') {
        return { ok: false, error: 'missing bytes field (canonical base64-encoded image)' }
    }

    let bytes: Uint8Array
    try {
        bytes = base64ToU8(b64)
    } catch (e) {
        return { ok: false, error: `bytes not valid base64: ${String(e)}` }
    }
    if (bytes.length !== 0x10000) {
        return { ok: false, error: `bytes is ${bytes.length} bytes, expected 65536` }
    }

    const filename = typeof obj.filename === 'string' ? obj.filename : ''
    return { ok: true, bytes, filename }
}
