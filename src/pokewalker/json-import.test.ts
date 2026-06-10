import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loadPokeEncoding } from './poke-encoding'
import { format } from './spec'
import { buildExport } from './json-export'
import { parseImport } from './json-import'

const dumpsDir = resolve(__dirname, '../../public')

describe('JSON export → import round-trip', () => {
    beforeAll(async () => {
        await loadPokeEncoding()
    })

    it('round-trips eeprom.bin byte-exactly', () => {
        const bytes = new Uint8Array(readFileSync(resolve(dumpsDir, 'eeprom.bin')))
        const view = new DataView(bytes.buffer)
        const parsed = format.read(view, 0)

        const payload = buildExport(bytes, 'eeprom.bin', parsed)
        const text = JSON.stringify(payload)
        const result = parseImport(text)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.bytes.length).toBe(bytes.length)
        expect(result.bytes).toEqual(bytes)
        expect(result.filename).toBe('eeprom.bin')
    })

    it('rejects unknown schemaVersion', () => {
        const r = parseImport(JSON.stringify({ schemaVersion: 999, bytes: '' }))
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toMatch(/schemaVersion 999/)
    })

    it('rejects missing bytes field', () => {
        const r = parseImport(JSON.stringify({ schemaVersion: 1 }))
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toMatch(/missing bytes/)
    })

    it('rejects wrong-length bytes', () => {
        const short = btoa('abc')
        const r = parseImport(JSON.stringify({ schemaVersion: 1, bytes: short }))
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toMatch(/3 bytes/)
    })
})
