// Export helpers for sprite data — raw .bin, scaled .png, animated .gif.
//
// .bin = the on-wire encoded bytes (column-major 8-row 2bpp pages).
// .png = a scaled-up RGBA image rendered through the same palette the
//        walker uses on-screen.
// .gif = animated 2-frame walker animation with a configurable frame delay.

import { spriteDataToBitmap, colors } from './decode-sprite'

export type SpriteData = {
    data: Uint8Array
    width: number
    height: number
}

const triggerDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
}

/** Save the raw walker-format bytes for one sprite. */
export const exportBin = (sprite: SpriteData, baseName: string) => {
    const blob = new Blob([sprite.data as BlobPart], { type: 'application/octet-stream' })
    triggerDownload(blob, `${baseName}.bin`)
}

/** Render to a temporary canvas at `scale` and download as a PNG. */
export const exportPng = async (sprite: SpriteData, baseName: string, scale = 4): Promise<void> => {
    const cnv = document.createElement('canvas')
    cnv.width = sprite.width * scale
    cnv.height = sprite.height * scale
    const ctx = cnv.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    ctx.imageSmoothingEnabled = false

    // Draw at native size into an offscreen canvas, then upscale via drawImage.
    const native = document.createElement('canvas')
    native.width = sprite.width
    native.height = sprite.height
    const nctx = native.getContext('2d')!
    const bitmap = spriteDataToBitmap(sprite.data.buffer, sprite.width, sprite.height)
    const img = nctx.createImageData(sprite.width, sprite.height)
    for (let i = 0; i < bitmap.length; i++) {
        const col = colors[bitmap[i] & 3]
        img.data[i * 4] = col[0]
        img.data[i * 4 + 1] = col[1]
        img.data[i * 4 + 2] = col[2]
        img.data[i * 4 + 3] = col[3]
    }
    nctx.putImageData(img, 0, 0)
    ctx.drawImage(native, 0, 0, sprite.width, sprite.height, 0, 0, cnv.width, cnv.height)

    await new Promise<void>((resolve) => {
        cnv.toBlob((blob) => {
            if (blob) triggerDownload(blob, `${baseName}.png`)
            resolve()
        }, 'image/png')
    })
}

// ---- GIF89a writer --------------------------------------------------------
//
// Hand-rolled. The LZW encoder is real (grows code width as the dictionary
// fills) because GIF decoders rely on the width-bump timing being correct.
// Output is a valid GIF89a; a 64×48 two-frame animation comes out around
// 2-3 KB.

const writeShortLE = (bytes: number[], v: number) => {
    bytes.push(v & 0xFF, (v >> 8) & 0xFF)
}

const lzwEncodeFrame = (pixels: Uint8Array, minCodeSize: number): number[] => {
    // Width stays at minCodeSize+1 forever because we emit a clear code
    // between every pixel — the decoder's dictionary never grows past the
    // base entries, so no width-bump synchronisation is needed. Trades a
    // bit of file size (≈6 bits/pixel instead of LZW's ≈2-3) for total
    // decoder-compatibility independent of the encoder/decoder width-bump
    // convention.
    const codeSize = minCodeSize + 1
    const clearCode = 1 << minCodeSize
    const eoiCode = clearCode + 1

    const bits: number[] = []
    let bitBuf = 0
    let bitLen = 0
    const emit = (code: number) => {
        bitBuf |= code << bitLen
        bitLen += codeSize
        while (bitLen >= 8) {
            bits.push(bitBuf & 0xFF)
            bitBuf >>= 8
            bitLen -= 8
        }
    }

    emit(clearCode)
    for (let i = 0; i < pixels.length; i++) {
        emit(pixels[i] & ((1 << minCodeSize) - 1))
        // Clear between every pixel keeps the decoder's dictionary at
        // base-size, so codeSize never needs to grow.
        if (i < pixels.length - 1) emit(clearCode)
    }
    emit(eoiCode)
    if (bitLen > 0) bits.push(bitBuf & 0xFF)

    // Pack into sub-blocks (each prefixed with its length, max 255).
    const out: number[] = [minCodeSize]
    for (let i = 0; i < bits.length; i += 255) {
        const chunk = bits.slice(i, Math.min(i + 255, bits.length))
        out.push(chunk.length, ...chunk)
    }
    out.push(0)
    return out
}

/**
 * Build an animated GIF from an array of 2bpp pixel buffers (all same size).
 * `delayMs` is per-frame delay in milliseconds (GIF uses 1/100 s units).
 */
export const buildGif = (
    frames: Uint8Array[],     // each is width*height bytes, values 0..3
    width: number,
    height: number,
    delayMs: number,
): Blob => {
    const out: number[] = []
    // Header
    for (const c of 'GIF89a') out.push(c.charCodeAt(0))
    // Logical Screen Descriptor
    writeShortLE(out, width)
    writeShortLE(out, height)
    // Packed: global color table | color resolution=7 (max) | sorted=0 | 2 bits = 4 entries
    out.push(0b1_111_0_001, 0, 0)
    // Global Color Table — 4 entries, walker's grayscale palette
    for (let i = 0; i < 4; i++) {
        out.push(colors[i][0], colors[i][1], colors[i][2])
    }

    // Netscape application extension — loop forever
    out.push(
        0x21, 0xFF, 0x0B,
        ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)),
        0x03, 0x01, 0x00, 0x00, 0x00,
    )

    const delayCs = Math.max(1, Math.round(delayMs / 10))
    for (const frame of frames) {
        // Graphic Control Extension
        out.push(0x21, 0xF9, 0x04, 0x00)
        writeShortLE(out, delayCs)
        out.push(0x00, 0x00)
        // Image Descriptor
        out.push(0x2C)
        writeShortLE(out, 0)
        writeShortLE(out, 0)
        writeShortLE(out, width)
        writeShortLE(out, height)
        out.push(0x00)   // local color table flag off
        // LZW image data (min code size 2 for 4-color)
        for (const b of lzwEncodeFrame(frame, 2)) out.push(b)
    }

    out.push(0x3B)   // trailer
    return new Blob([new Uint8Array(out) as BlobPart], { type: 'image/gif' })
}

/** Export a multi-frame animated sprite as a GIF. */
export const exportGif = (frames: SpriteData[], baseName: string, delayMs = 300) => {
    if (frames.length === 0) return
    const w = frames[0].width
    const h = frames[0].height
    const bitmaps = frames.map((f) => spriteDataToBitmap(f.data.buffer, w, h))
    const blob = buildGif(bitmaps, w, h, delayMs)
    triggerDownload(blob, `${baseName}.gif`)
}
