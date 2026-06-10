// Serializes the parsed EEPROM tree into a JSON-friendly shape.
//
// Wrapper format:
//   {
//     schemaVersion: 1,
//     exportedAt: ISO8601,
//     filename: string,
//     bytes: base64 of the canonical 64KB image,   // authoritative
//     view: JSON-friendly parsed tree,             // informational
//   }
//
// On import, `bytes` is the source of truth. `view` is for humans diffing
// or hand-editing the file in a text editor.

export const SCHEMA_VERSION = 1

const u8ToBase64 = (u8: Uint8Array): string => {
    let bin = ''
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
    return btoa(bin)
}

// Recursively rewrite the parsed tree into a form JSON.stringify can handle.
// Wrapped-value types (PokeStringValue, SpriteValue, EnumValue) and Uint8Array
// each get a compact human-readable representation.
const toView = (v: unknown): unknown => {
    if (v == null) return v
    if (typeof v !== 'object') return v
    if (v instanceof Uint8Array) return { _type: 'bytes', data: u8ToBase64(v) }
    if (Array.isArray(v)) return v.map(toView)

    const rec = v as Record<string, unknown>
    if (rec._type === 'pokestring') {
        return { _type: 'pokestring', text: rec._data, raw: u8ToBase64(rec._raw as Uint8Array) }
    }
    if (rec._type === 'sprite') {
        return {
            _type: 'sprite',
            width: rec._width,
            height: rec._height,
            data: u8ToBase64(rec.data as Uint8Array),
        }
    }
    if (rec._type === 'enum') {
        return { _type: 'enum', value: rec._data, label: rec._annotate }
    }

    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(rec)) out[k] = toView(val)
    return out
}

export const buildExport = (bytes: Uint8Array, filename: string, parsed: unknown) => ({
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    filename,
    bytes: u8ToBase64(bytes),
    view: toView(parsed),
})
