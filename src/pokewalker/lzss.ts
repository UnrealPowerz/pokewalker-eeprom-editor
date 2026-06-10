// Minimal LZSS encoder + decoder for shrinking share-URL payloads.
//
// Format (a common LZ77-with-flag-byte variant):
//   - Repeating block: one control byte, then 8 tokens.
//   - Control bit N (LSB first) is 0 = literal (next 1 byte is output),
//     1 = back-reference (next 2 bytes pack a 12-bit offset + 4-bit length).
//   - Back-ref encoding: 16-bit big-endian; offset = packed >> 4, actual
//     distance = (offset + 1) bytes back; length = packed & 0x0F, actual
//     match length = length + MIN_MATCH.
//   - Window: 4096 bytes. Match lengths 3..18 inclusive.

const WINDOW_SIZE = 4096
const MIN_MATCH = 3
const MAX_MATCH = 18

export const lzssEncode = (input: Uint8Array): Uint8Array => {
    const out: number[] = []
    let pos = 0

    while (pos < input.length) {
        let controlByte = 0
        const tokenBytes: number[] = []
        let tokenCount = 0

        while (tokenCount < 8 && pos < input.length) {
            // Brute-force longest-match search within the sliding window. For
            // share-URL-sized payloads (≤ a few KB) the O(n²·L) cost is fine.
            let bestLen = 0
            let bestOff = 0
            const windowStart = Math.max(0, pos - WINDOW_SIZE)
            for (let candidate = windowStart; candidate < pos; candidate++) {
                let matchLen = 0
                while (
                    matchLen < MAX_MATCH &&
                    pos + matchLen < input.length &&
                    input[candidate + matchLen] === input[pos + matchLen]
                ) {
                    matchLen++
                }
                if (matchLen >= MIN_MATCH && matchLen > bestLen) {
                    bestLen = matchLen
                    bestOff = pos - candidate
                    if (matchLen === MAX_MATCH) break
                }
            }

            if (bestLen >= MIN_MATCH) {
                controlByte |= (1 << tokenCount)
                const packed = ((bestOff - 1) << 4) | (bestLen - MIN_MATCH)
                tokenBytes.push((packed >> 8) & 0xFF)
                tokenBytes.push(packed & 0xFF)
                pos += bestLen
            } else {
                tokenBytes.push(input[pos])
                pos++
            }
            tokenCount++
        }

        out.push(controlByte)
        for (const b of tokenBytes) out.push(b)
    }

    return new Uint8Array(out)
}

export const lzssDecode = (input: Uint8Array): Uint8Array => {
    const out: number[] = []
    let pos = 0

    while (pos < input.length) {
        const controlByte = input[pos++]
        for (let bit = 0; bit < 8 && pos < input.length; bit++) {
            if (controlByte & (1 << bit)) {
                if (pos + 2 > input.length) return new Uint8Array(out)
                const packed = (input[pos] << 8) | input[pos + 1]
                pos += 2
                const offset = (packed >> 4) + 1
                const length = (packed & 0x0F) + MIN_MATCH
                const start = out.length - offset
                if (start < 0) throw new Error('LZSS: bad back-reference')
                for (let i = 0; i < length; i++) {
                    out.push(out[start + i])
                }
            } else {
                out.push(input[pos++])
            }
        }
    }

    return new Uint8Array(out)
}
