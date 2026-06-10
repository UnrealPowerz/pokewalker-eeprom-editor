// URL-safe encoding of raw editor state. The standalone sound + sprite
// editors put their current buffer in the URL hash so a link is enough to
// reproduce the asset on another machine, no EEPROM file needed.
//
// Hash formats:
//   #share/sprite/WxH/<base64url>   compressed walker-format sprite bytes
//   #share/sound/<base64url>        compressed sound-engine (b0, b1) bytes
//
// Compression: each payload is prefixed with a one-byte format tag:
//   0x00 = raw (the rest is the original bytes)
//   0x01 = LZSS-compressed (the rest goes through lzssDecode)
// The encoder picks whichever shrinks the URL more for that specific
// payload — tiny or random-looking data stays raw, bigger / repetitive
// data takes the LZSS path.
//
// base64url = standard base64 with `+` → `-`, `/` → `_`, `=` padding stripped.

import { lzssEncode, lzssDecode } from './lzss'

const FORMAT_RAW = 0x00
const FORMAT_LZSS = 0x01

const compressPayload = (raw: Uint8Array): Uint8Array => {
    const compressed = lzssEncode(raw)
    // +1 in both cases accounts for the format-tag byte. Tie → raw wins
    // (decoding is faster and the URL length is the same).
    if (compressed.length < raw.length) {
        const out = new Uint8Array(compressed.length + 1)
        out[0] = FORMAT_LZSS
        out.set(compressed, 1)
        return out
    }
    const out = new Uint8Array(raw.length + 1)
    out[0] = FORMAT_RAW
    out.set(raw, 1)
    return out
}

const decompressPayload = (tagged: Uint8Array): Uint8Array | null => {
    if (tagged.length === 0) return null
    const format = tagged[0]
    const body = tagged.subarray(1)
    if (format === FORMAT_RAW) return new Uint8Array(body)
    if (format === FORMAT_LZSS) {
        try { return lzssDecode(body) }
        catch { return null }
    }
    return null
}

const u8ToB64Url = (u8: Uint8Array): string => {
    let bin = ''
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
    return btoa(bin)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

const b64UrlToU8 = (s: string): Uint8Array => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const bin = atob(padded)
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    return u8
}

export type SpriteShare = { width: number; height: number; bytes: Uint8Array }
export type SoundShare = { bytes: Uint8Array }

export const encodeSpriteShare = (s: SpriteShare): string =>
    `share/sprite/${s.width}x${s.height}/${u8ToB64Url(compressPayload(s.bytes))}`

export const encodeSoundShare = (s: SoundShare): string =>
    `share/sound/${u8ToB64Url(compressPayload(s.bytes))}`

export const decodeSpriteShare = (route: string): SpriteShare | null => {
    const m = route.match(/^share\/sprite\/(\d+)x(\d+)\/(.+)$/)
    if (!m) return null
    const width = parseInt(m[1], 10)
    const height = parseInt(m[2], 10)
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    if (width <= 0 || height <= 0 || width > 256 || height > 256) return null
    try {
        const bytes = decompressPayload(b64UrlToU8(m[3]))
        if (!bytes) return null
        return { width, height, bytes }
    } catch {
        return null
    }
}

export const decodeSoundShare = (route: string): SoundShare | null => {
    const m = route.match(/^share\/sound\/(.+)$/)
    if (!m) return null
    try {
        const bytes = decompressPayload(b64UrlToU8(m[1]))
        if (!bytes) return null
        return { bytes }
    } catch {
        return null
    }
}

/**
 * Copy a fully-qualified share URL to the clipboard. Returns the URL (so
 * callers can also display it). The fallback shows a prompt() so the user
 * can copy manually if the clipboard API isn't available (insecure
 * contexts, older browsers).
 */
export const copyShareUrl = async (routeFragment: string): Promise<string> => {
    const url = `${window.location.origin}${window.location.pathname}#/${routeFragment}`
    try {
        await navigator.clipboard.writeText(url)
    } catch {
        window.prompt('Copy this share URL:', url)
    }
    return url
}
