import { describe, it, expect } from 'vitest'
import { lzssEncode, lzssDecode } from './lzss'

const eq = (a: Uint8Array, b: Uint8Array) => {
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) expect(a[i]).toBe(b[i])
}

describe('lzss round-trips', () => {
    it('empty input', () => {
        const enc = lzssEncode(new Uint8Array(0))
        const dec = lzssDecode(enc)
        expect(dec.length).toBe(0)
    })

    it('single byte', () => {
        const src = new Uint8Array([0x42])
        eq(lzssDecode(lzssEncode(src)), src)
    })

    it('short literal-only sequence (random)', () => {
        const src = new Uint8Array([0x01, 0x10, 0xA5, 0x37, 0xC8, 0x99, 0x42, 0x11])
        eq(lzssDecode(lzssEncode(src)), src)
    })

    it('highly compressible all-zero block', () => {
        const src = new Uint8Array(512)
        const enc = lzssEncode(src)
        expect(enc.length).toBeLessThan(src.length / 8)
        eq(lzssDecode(enc), src)
    })

    it('repeating pattern (back-ref-heavy)', () => {
        const src = new Uint8Array(256)
        for (let i = 0; i < src.length; i++) src[i] = i % 4
        eq(lzssDecode(lzssEncode(src)), src)
    })

    it('mixed literals and matches', () => {
        const src = new Uint8Array(200)
        for (let i = 0; i < 50; i++) src[i] = i
        for (let i = 50; i < 100; i++) src[i] = 0xFF
        for (let i = 100; i < 200; i++) src[i] = src[i - 100]
        eq(lzssDecode(lzssEncode(src)), src)
    })

    it('handles a match that extends to end of input', () => {
        const src = new Uint8Array(64)
        for (let i = 0; i < src.length; i++) src[i] = i < 32 ? 0xAB : 0xAB
        eq(lzssDecode(lzssEncode(src)), src)
    })
})

describe('lzss size relative to raw', () => {
    it('compresses an all-zero 256-byte block to under 40 bytes', () => {
        const src = new Uint8Array(256)
        const enc = lzssEncode(src)
        expect(enc.length).toBeLessThan(40)
    })

    it('does not blow up random-looking data by more than ~13%', () => {
        // Pseudo-random byte stream (deterministic so tests are stable).
        const src = new Uint8Array(256)
        let state = 0x12345678
        for (let i = 0; i < src.length; i++) {
            state = (state * 1103515245 + 12345) & 0x7FFFFFFF
            src[i] = state & 0xFF
        }
        const enc = lzssEncode(src)
        expect(enc.length).toBeLessThan(src.length + Math.ceil(src.length / 8) + 4)
    })
})
