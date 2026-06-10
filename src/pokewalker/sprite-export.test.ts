import { describe, it, expect } from 'vitest'
import { buildGif } from './sprite-export'

// Minimal GIF LZW decoder — used as a sanity check that our encoded output
// is actually consumable by a standard decoder. Returns the pixel arrays
// of every frame in order.
const decodeGifFrames = (buf: Uint8Array): Uint8Array[] => {
    let p = 6                                     // skip "GIF89a"
    const width = buf[p] | (buf[p + 1] << 8); p += 2
    const _height = buf[p] | (buf[p + 1] << 8); p += 2
    const packed = buf[p]; p += 3                // packed + bg + par
    const gctSize = 1 << ((packed & 0x07) + 1)
    p += gctSize * 3                              // skip GCT

    const frames: Uint8Array[] = []
    while (p < buf.length) {
        const introducer = buf[p++]
        if (introducer === 0x3B) break            // trailer
        if (introducer === 0x21) {                // extension
            p++                                   // label
            while (buf[p] !== 0) p += buf[p] + 1
            p++
            continue
        }
        if (introducer === 0x2C) {                // image descriptor
            const left = buf[p] | (buf[p + 1] << 8); p += 2
            const top = buf[p] | (buf[p + 1] << 8); p += 2
            const w = buf[p] | (buf[p + 1] << 8); p += 2
            const h = buf[p] | (buf[p + 1] << 8); p += 2
            void left; void top
            p++                                   // packed
            const minCodeSize = buf[p++]
            const dataBytes: number[] = []
            while (buf[p] !== 0) {
                const len = buf[p++]
                for (let i = 0; i < len; i++) dataBytes.push(buf[p + i])
                p += len
            }
            p++                                   // sub-block terminator
            frames.push(lzwDecode(new Uint8Array(dataBytes), minCodeSize, w * h))
            continue
        }
        throw new Error(`unexpected byte 0x${introducer.toString(16)} at ${p}`)
    }
    void width
    return frames
}

const lzwDecode = (data: Uint8Array, minCodeSize: number, totalPixels: number): Uint8Array => {
    const clearCode = 1 << minCodeSize
    const eoiCode = clearCode + 1
    let codeSize = minCodeSize + 1
    let dict: number[][] = []
    const resetDict = () => {
        dict = []
        for (let i = 0; i < clearCode; i++) dict.push([i])
        dict.push([])   // clear
        dict.push([])   // eoi
    }
    resetDict()

    const out = new Uint8Array(totalPixels)
    let outIdx = 0
    let bitBuf = 0
    let bitLen = 0
    let dataPos = 0
    const readCode = (): number => {
        while (bitLen < codeSize) {
            if (dataPos >= data.length) return -1
            bitBuf |= data[dataPos++] << bitLen
            bitLen += 8
        }
        const c = bitBuf & ((1 << codeSize) - 1)
        bitBuf >>= codeSize
        bitLen -= codeSize
        return c
    }

    let prev: number[] | null = null
    while (true) {
        const c = readCode()
        if (c < 0 || c === eoiCode) break
        if (c === clearCode) {
            resetDict()
            codeSize = minCodeSize + 1
            prev = null
            continue
        }
        let s: number[]
        if (c < dict.length) s = dict[c]
        else if (prev) s = [...prev, prev[0]]
        else throw new Error(`bad code ${c}`)
        for (const v of s) out[outIdx++] = v
        if (prev) {
            dict.push([...prev, s[0]])
            if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++
        }
        prev = s
    }
    return out
}



describe('buildGif', () => {
    it('produces a valid GIF89a header + trailer', async () => {
        const w = 4, h = 4
        const f1 = new Uint8Array(w * h).fill(0)
        const f2 = new Uint8Array(w * h).fill(3)
        const blob = buildGif([f1, f2], w, h, 100)
        const buf = new Uint8Array(await blob.arrayBuffer())
        // Magic: GIF89a
        expect(String.fromCharCode(...buf.slice(0, 6))).toBe('GIF89a')
        // Trailer: 0x3B
        expect(buf[buf.length - 1]).toBe(0x3B)
        // Should contain the Netscape loop extension signature
        const asStr = String.fromCharCode(...buf)
        expect(asStr).toContain('NETSCAPE2.0')
    })

    it('round-trips through a standard GIF LZW decoder', async () => {
        const w = 8, h = 8
        // Use a pattern with all 4 colors so LZW gets non-trivial input.
        const pattern = new Uint8Array(w * h)
        for (let i = 0; i < pattern.length; i++) pattern[i] = (i + Math.floor(i / w)) % 4
        const blob = buildGif([pattern], w, h, 100)
        const buf = new Uint8Array(await blob.arrayBuffer())
        const decoded = decodeGifFrames(buf)
        expect(decoded.length).toBe(1)
        expect(Array.from(decoded[0])).toEqual(Array.from(pattern))
    })

    it('round-trips a multi-frame animation', async () => {
        const w = 16, h = 16
        const f0 = new Uint8Array(w * h).fill(0)
        const f1 = new Uint8Array(w * h).fill(3)
        const f2 = new Uint8Array(w * h).map((_, i) => i % 4)
        const blob = buildGif([f0, f1, f2], w, h, 200)
        const buf = new Uint8Array(await blob.arrayBuffer())
        const decoded = decodeGifFrames(buf)
        expect(decoded.length).toBe(3)
        expect(Array.from(decoded[0])).toEqual(Array.from(f0))
        expect(Array.from(decoded[1])).toEqual(Array.from(f1))
        expect(Array.from(decoded[2])).toEqual(Array.from(f2))
    })
})
