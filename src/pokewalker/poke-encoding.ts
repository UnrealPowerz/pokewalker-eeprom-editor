import encoding from '../assets/encoding.txt'
const decoder = new TextDecoder('utf-16')
let decodeMap: number[] | undefined

export const decodePokeString = (data: DataView, offset: number, length: number) => {
    if (decodeMap == null) {
        throw new Error('Poke encoding has not been loaded')
    }
    const strDat = new Uint16Array(new ArrayBuffer(length*2))
    let i = 0
    for (; i < length; i++) {
        const byte = data.getUint16(offset+i*2, true)
        if (byte == 0xFFFF) {
            break
        }
        strDat[i] = decodeMap[byte]
    }
    return decoder.decode(strDat.slice(0, i))
}

export const loadPokeEncoding = async () => {
    if (decodeMap != null) {
        return
    }
    const resp = await fetch(encoding)
    const text = await resp.text()
    const lines = text.split('\n')
    const entries = lines.filter(l => l.length > 0).map(l => 
        [parseInt(l.substring(0, 4), 16), parseInt(l.substring(5, 9), 16)]
    )
    decodeMap = []
    for (const [k, v] of entries) {
        decodeMap[k] = v
    }
}