import { loadPokeEncoding } from './poke-encoding'
import { format } from './spec'

export const loadEeprom = async (buffer: ArrayBuffer) => {
    await loadPokeEncoding()
    const eeprom = new DataView(buffer)
    const data = format.read(eeprom, 0)

    return data
}