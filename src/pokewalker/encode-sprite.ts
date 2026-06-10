// Inverse of decode-sprite.ts. Takes a width*height pixel buffer of 2bpp
// values (0..3) and writes the column-major 8-row-page packed format the
// Pokéwalker uses (each u16 holds one column of 8 rows; bit r2 is the low
// plane of row r2 within the page, bit r2+8 is the high plane).

export const encodeSprite = (
    pixels: ArrayLike<number>,
    width: number,
    height: number,
): Uint8Array => {
    const bytes = new Uint8Array((width * height) / 4)
    const view = new DataView(bytes.buffer)
    let i = 0
    for (let r = 0; r < height; r += 8) {
        for (let c = 0; c < width; c++) {
            let u16 = 0
            for (let r2 = 0; r2 < 8 && r + r2 < height; r2++) {
                const col = pixels[(r + r2) * width + c] & 0x3
                const low = col & 0x1
                const high = (col >> 1) & 0x1
                u16 |= (low << r2) | (high << (r2 + 8))
            }
            view.setUint16(i * 2, u16, true)
            i++
        }
    }
    return bytes
}
