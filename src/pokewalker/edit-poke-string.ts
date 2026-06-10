import { encodePokeString } from './poke-encoding'
import type { PokeStringValue } from './spec'

/**
 * Build a new PokeStringValue from an edited text, preserving the trailing
 * bytes from the original where possible.
 *
 * The text gets encoded into the start of a fresh byte buffer (with the
 * 0xFFFF terminator). Bytes past the terminator inherit from the original
 * value's `_raw`, so factory-padded fields keep their padding (0xFF or 0x00)
 * unchanged across edits.
 */
export const editPokeString = (
    original: PokeStringValue,
    newText: string,
): PokeStringValue => {
    const byteLen = original._raw.length
    const length = byteLen / 2  // u16 codepoints
    const fresh = new Uint8Array(byteLen)
    fresh.set(original._raw)  // start with the original bytes — preserves tail

    const view = new DataView(fresh.buffer)
    const written = encodePokeString(view, 0, length, newText)
    // encodePokeString returns the number of u16s written INCLUDING the
    // terminator (if it fit). Any u16 after that keeps its pre-existing
    // bytes from the original.
    void written

    return {
        _data: newText,
        _raw: fresh,
        _type: 'pokestring',
    }
}
