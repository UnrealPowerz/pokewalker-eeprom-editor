export const decompressOverlay = (buffer: ArrayBuffer): ArrayBuffer => {
    const data = new DataView(buffer)
    
    const extraSize = data.getUint32(data.byteLength - 4, true)
    console.log({ extraSize })



    return new ArrayBuffer(1)
}