const colors = [
    [172, 174, 163, 255],
    [128, 130, 116, 255],
    [92, 92, 82, 255],
    [30, 25, 22, 255]
]

// Credit to DmitryGR for this algo
const spriteDataToBitmap = (buffer: ArrayBuffer, width: number, height: number): Uint8Array => {
    const data = new Uint16Array(buffer, 0)
    const res = new Uint8Array(new ArrayBuffer(width * height))

    let i = 0;
    for (let r = 0; r < height; r += 8) {
        for (let c = 0; c < width; c++) {
            const curr = data[i++];
            for (let r2 = 0; r2 < 8; r2++) {
                let o = curr >> r2
                let col = ((o & 0x100) >> 7) | (o & 1);
                res[(r + r2) * width + c] = col
            }
        }
    }

    return res
}

const bitmapToImageData = (data: Uint8Array, width: number, height: number): ImageData => {
    const imgData = new Uint8ClampedArray(new ArrayBuffer(width * height * 4))

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dataIdx = y * width + x
            const imgDataIdx = dataIdx * 4
            const col = colors[data[dataIdx]]

            for (let i = 0; i < 4; i++) {
                imgData[imgDataIdx + i] = col[i]
            }
        }
    }

    return new ImageData(imgData, width, height)
}

export const decodeSprite = (buffer: ArrayBuffer, width: number, height: number) => {
    const bitmap = spriteDataToBitmap(buffer, width, height)
    return bitmapToImageData(bitmap, width, height)
}
