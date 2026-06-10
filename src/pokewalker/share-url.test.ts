import { describe, it, expect } from 'vitest'
import {
    encodeSpriteShare, decodeSpriteShare,
    encodeSoundShare, decodeSoundShare,
} from './share-url'

describe('share-url codec', () => {
    it('round-trips a sprite payload byte-exactly', () => {
        const bytes = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0x12, 0x34, 0x56, 0x78])
        const fragment = encodeSpriteShare({ width: 8, height: 16, bytes })
        expect(fragment.startsWith('share/sprite/8x16/')).toBe(true)
        const decoded = decodeSpriteShare(fragment)
        expect(decoded).not.toBeNull()
        expect(decoded!.width).toBe(8)
        expect(decoded!.height).toBe(16)
        expect(Array.from(decoded!.bytes)).toEqual(Array.from(bytes))
    })

    it('round-trips a sound payload', () => {
        const bytes = new Uint8Array([0x20, 0x03, 0x18, 0x06, 0x18, 0x09, 0x00, 0x7F])
        const fragment = encodeSoundShare({ bytes })
        expect(fragment.startsWith('share/sound/')).toBe(true)
        const decoded = decodeSoundShare(fragment)
        expect(decoded).not.toBeNull()
        expect(Array.from(decoded!.bytes)).toEqual(Array.from(bytes))
    })

    it('rejects malformed sprite routes', () => {
        expect(decodeSpriteShare('share/sprite/')).toBeNull()
        expect(decodeSpriteShare('share/sprite/nope')).toBeNull()
        expect(decodeSpriteShare('share/sprite/0x0/abc')).toBeNull()
        expect(decodeSpriteShare('share/sprite/-1x16/abc')).toBeNull()
    })

    it('rejects routes that aren\'t share routes at all', () => {
        expect(decodeSpriteShare('general')).toBeNull()
        expect(decodeSoundShare('share/sprite/8x8/abc')).toBeNull()
    })

    it('shrinks the URL for a highly-compressible all-zero sprite', () => {
        // 64×48 blank sprite = 768 raw bytes ≈ 1024 base64 chars. LZSS should
        // hammer that down to a tiny payload.
        const blank = new Uint8Array(64 * 48 / 4)
        const compressed = encodeSpriteShare({ width: 64, height: 48, bytes: blank })
        // Sanity floor: keep the URL under 200 chars including the prefix.
        expect(compressed.length).toBeLessThan(200)
        // Round-trip still works.
        const decoded = decodeSpriteShare(compressed)
        expect(decoded).not.toBeNull()
        expect(decoded!.width).toBe(64)
        expect(decoded!.height).toBe(48)
        expect(decoded!.bytes.length).toBe(blank.length)
        for (let i = 0; i < blank.length; i++) expect(decoded!.bytes[i]).toBe(0)
    })
})
