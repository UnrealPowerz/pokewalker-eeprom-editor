import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { readDirectory, parseRaw, encodeRaw, computeChecksum, repackPool, TOK_END } from './sound'

const dumpsDir = resolve(__dirname, '../../public')
const dumps = readdirSync(dumpsDir).filter((f) => f.endsWith('.bin'))

describe('sound parseRaw → encodeRaw round-trip', () => {
    for (const file of dumps) {
        it(`round-trips every entry in ${file} that has a TOK_END terminator`, () => {
            const buf = readFileSync(resolve(dumpsDir, file))
            const bytes = new Uint8Array(buf)
            if (bytes.length < 0x8EFF) return

            const entries = readDirectory(bytes)
            for (const entry of entries) {
                if (!entry.valid) continue
                if (entry.length < 2) continue
                // Look for a TOK_END (or TOK_SCRATCH) terminator within the entry's
                // declared length. Some unused/uninitialized entries have neither
                // and would fail round-trip; skip those — they're walker-junk.
                let terminated = false
                for (let i = 1; i < entry.data.length; i += 2) {
                    const code = entry.data[i] & 0x7F
                    if (code === TOK_END || code === 0x7E) { terminated = true; break }
                }
                if (!terminated) continue

                const { events, terminator } = parseRaw(entry.data)
                const re = encodeRaw(events, terminator)

                // Truncate the original at its terminator+1 byte for compare —
                // bytes past the terminator are pool padding from neighbouring
                // entries and aren't part of this entry's semantic content.
                let endIdx = entry.data.length
                for (let i = 1; i < entry.data.length; i += 2) {
                    const code = entry.data[i] & 0x7F
                    if (code === TOK_END || code === 0x7E) { endIdx = i + 1; break }
                }
                const trimmed = entry.data.subarray(0, endIdx)

                expect(re).toEqual(trimmed)
            }
        })
    }
})

describe('repackPool', () => {
    it('preserves per-entry data (length + content) across a no-op repack', () => {
        for (const file of dumps) {
            const bytes = new Uint8Array(readFileSync(resolve(dumpsDir, file)))
            if (bytes.length < 0x8EFF) continue
            const before = readDirectory(bytes)
            const repacked = repackPool(bytes, before)
            expect(repacked).not.toBeNull()
            const after = readDirectory(repacked!)
            for (let i = 0; i < before.length; i++) {
                expect(after[i].length).toBe(before[i].length)
                expect(after[i].checksum).toBe(before[i].checksum)
                expect(Array.from(after[i].data)).toEqual(Array.from(before[i].data))
            }
        }
    })

    it('returns null when entries exceed POOL_SIZE', () => {
        const bytes = new Uint8Array(0x10000)
        const entries = readDirectory(bytes)
        // Inflate every entry to max — 16 × 0xC0 = 3072 > 528 pool size.
        const huge = entries.map((e) => ({ ...e, data: new Uint8Array(0xC0).fill(0x42) }))
        expect(repackPool(bytes, huge)).toBeNull()
    })
})

describe('checksum', () => {
    it('matches the directory checksum byte for every valid entry', () => {
        for (const file of dumps) {
            const buf = readFileSync(resolve(dumpsDir, file))
            const bytes = new Uint8Array(buf)
            if (bytes.length < 0x8EFF) continue
            const entries = readDirectory(bytes)
            for (const entry of entries) {
                if (!entry.valid) continue
                if (entry.length === 0) continue
                expect(computeChecksum(entry.data)).toBe(entry.checksum)
            }
        }
    })
})
