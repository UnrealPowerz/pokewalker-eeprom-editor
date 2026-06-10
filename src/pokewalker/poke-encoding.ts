// Bundle the encoding table as a string at build time. Works in both the
// browser (Vite handles the ?raw suffix) and in Vitest (the same import is
// recognised). No fetch required.
import encodingText from '../assets/encoding.txt?raw'

const decoder = new TextDecoder('utf-16')
let decodeMap: number[] | undefined        // eeprom_code -> utf16 code
let encodeMap: Map<number, number> | undefined // utf16 code -> eeprom_code
let loaded = false

const ensureLoaded = () => {
    if (loaded) return
    const lines = encodingText.split('\n')
    const entries = lines.filter(l => l.length > 0).map(l =>
        [parseInt(l.substring(0, 4), 16), parseInt(l.substring(5, 9), 16)]
    )
    const dec: number[] = []
    const enc = new Map<number, number>()
    for (const [k, v] of entries) {
        dec[k] = v
        enc.set(v, k)
    }
    decodeMap = dec
    encodeMap = enc
    loaded = true
}

export const decodePokeString = (data: DataView, offset: number, length: number) => {
    ensureLoaded()
    const dec = decodeMap!
    const strDat = new Uint16Array(new ArrayBuffer(length * 2))
    let i = 0
    for (; i < length; i++) {
        const code = data.getUint16(offset + i * 2, true)
        if (code === 0xFFFF) {
            break
        }
        strDat[i] = dec[code]
    }
    return decoder.decode(strDat.slice(0, i))
}

// Encode a string into the EEPROM at `offset` as `length` u16 LE codepoints.
// The string is terminated with 0xFFFF; bytes after the terminator are NOT
// touched by this function — the caller is responsible for whatever padding
// scheme they want (write 0xFF, write 0x00, or preserve whatever was there).
// Characters not in the encoding map are silently replaced with 0x0000.
//
// Returns the number of u16 elements written (including the terminator if it
// fits) so the caller knows where the unwritten tail starts.
export const encodePokeString = (
    data: DataView,
    offset: number,
    length: number,
    value: string,
): number => {
    ensureLoaded()
    const enc = encodeMap!
    let i = 0
    for (; i < Math.min(value.length, length); i++) {
        const utf16 = value.charCodeAt(i)
        const eep = enc.get(utf16) ?? 0
        data.setUint16(offset + i * 2, eep, true)
    }
    if (i < length) {
        data.setUint16(offset + i * 2, 0xFFFF, true)
        return i + 1
    }
    return i
}

// Kept as an async function so existing callers (loadEeprom) don't have to
// change; just calls the synchronous loader inside.
export const loadPokeEncoding = async () => {
    ensureLoaded()
}
