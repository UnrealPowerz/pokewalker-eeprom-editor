import { BArray, Bytes, FixedLengthString, Int16ul, Int32ul, Int8u, Struct } from "../util/bin"
import { decompressOverlay } from "./decompress-overlay"

const ProcSpec = Struct({
    romOffset: Int32ul,
    entryOffset: Int32ul,
    ramAddress: Int32ul,
    size: Int32ul
})

const NdsHeaderSpec = Struct({
    title: FixedLengthString(12),
    gamecode: FixedLengthString(4),
    makercode: FixedLengthString(2),
    unitcode: Int8u,
    encryptionSeed: Int8u,
    deviceCapacity: Int8u,
    reserved1: Bytes(7),
    reserved2: Int8u,
    region: Int8u,
    version: Int8u,
    autoStart: Int8u,
    arm9: ProcSpec,
    arm7: ProcSpec,
    fileNameTableOffset: Int32ul,
    fileNameTableSize: Int32ul,
    fileAllocationTableOffset: Int32ul,
    fileAllocationTableSize: Int32ul,
    fileArm9OverlayOffset: Int32ul,
    fileArm9OverlaySize: Int32ul,
    fileArm7OverlayOffset: Int32ul,
    fileArm7OverlaySize: Int32ul,
    portSettingNormal: Int32ul,
    portSettingKey1: Int32ul,
    iconOffset: Int32ul,
    secureAreaChecksum: Int16ul,
    secureAreaDelay: Int16ul,
    arm9AutoLoad: Int32ul,
    arm7AutoLoad: Int32ul,
    secureAreaDisable: Bytes(8),
    usedRomSize: Int32ul,
    romHeaderSize: Int32ul,
    unknown: Int32ul,
    reserved3: Bytes(8),
    nandEndOfRom: Int16ul,
    nandStartOfRw: Int16ul,
    reserved4: Bytes(0x18),
    reserved5: Bytes(0x10),
    nintendoLogo: Bytes(0x9C),
    nintendoLogoChecksum: Int16ul,
    headerChecksum: Int16ul,
    debugRomOffset: Int32ul,
    debugSize: Int32ul,
    debugRamAddress: Int32ul,
    reserved6: Int32ul,
    reserved7: Bytes(0x90),
    reserved8: Bytes(0xE00)
})

const FileAllocationTable = (length: number) => 
    BArray(
        length, 
        Struct({
            startOffset: Int32ul,
            endOffset: Int32ul
        })
    )

const OverlayTable = (length: number) =>
    BArray(
        length,
        Struct({
            overlayId: Int32ul,
            ramAddress: Int32ul,
            ramSize: Int32ul,
            bssSize: Int32ul,
            staticInitialiserStart: Int32ul,
            staticInitialiserEnd: Int32ul,
            fileId: Int32ul,
            compression: Int32ul
        })
    )

const FntDirectory = Struct({
    subTableOffset: Int32ul,
    firstFileId: Int16ul,
    totalNumberOrParentId: Int16ul
})

const readFntSubtable = (data: DataView, offset: number) => {
    const entries: { name: string, subfolderId?: number }[] = []
    while (true) {
        const typeOrLength = data.getUint8(offset)

        if (typeOrLength === 0) {
            break
        }

        const isDirectory = (typeOrLength >> 7) === 1
        const length = typeOrLength & ((1 << 7) - 1)
        const name = FixedLengthString(length).read(data, offset+1)
        offset += length + 1
    
        let subfolderId: number | undefined = undefined
        if (isDirectory) {
            subfolderId = data.getInt8(offset)
            offset += 2
        }

        entries.push({ name, subfolderId })
    }
    return entries
}

const readFnt = (data: DataView, offset: number) => {
    const root = FntDirectory.read(data, offset)
    const num = root.totalNumberOrParentId

    const entries = BArray(num, FntDirectory)
        .read(data, offset)
        .map(entry => ({...entry, contents: readFntSubtable(data, offset+entry.subTableOffset)}))

    return entries
}

const getFileId = (fnt: ReturnType<typeof readFnt>, name: string) => {
    const parts = name.split('/')

    let dir = fnt[0]
    for (const [i, part] of parts.entries()) {
        const childIndex = dir.contents.findIndex(v => v.name == part)
        if (childIndex == null) {
            return undefined
        }

        const child = dir.contents[childIndex]
        if (child.subfolderId == null) {
            if (i === parts.length - 1) {
                return dir.firstFileId + childIndex
            }
            return undefined
        }
        dir = fnt[child.subfolderId]
    }
    return undefined
}

const NarcHeader = Struct({
    narc: FixedLengthString(4),
    byteOrder: Int16ul,
    version: Int16ul,
    fileSize: Int32ul,
    chunkSize: Int16ul,
    numChunks: Int16ul,
})

const NarcChunkHeader = Struct({
    chunkName: FixedLengthString(4),
    chunkSize: Int32ul,
})

const BtafChunkInfo = Struct({
    numFiles: Int16ul,
    reserved: Int16ul,
})

const readNarc = (buffer: ArrayBuffer) => {
    const data = new DataView(buffer)

    let offset = 0

    const header = NarcHeader.read(data)
    offset += NarcHeader.length

    const btafChunkHeader = NarcChunkHeader.read(data, offset)
    offset += NarcChunkHeader.length

    const btafChunkInfo = BtafChunkInfo.read(data, offset)
    offset += BtafChunkInfo.length

    const fat = FileAllocationTable(btafChunkInfo.numFiles).read(data, offset)
    offset += 8 * btafChunkInfo.numFiles

    const btnfChunkHeader = NarcChunkHeader.read(data, offset)
    offset += NarcChunkHeader.length

    const fnt = readFnt(data, offset)

    return { fat, fnt }
}

export const loadRom = (buffer: ArrayBuffer) => {
    const data = new DataView(buffer)
    const header = NdsHeaderSpec.read(data)
    const fat = FileAllocationTable(header.fileAllocationTableSize / 8)
        .read(data, header.fileAllocationTableOffset)
    const arm9Ovt = OverlayTable(header.fileArm9OverlaySize / 32)
        .read(data, header.fileArm9OverlayOffset)

    const fnt = readFnt(data, header.fileNameTableOffset)
    
    const fileId = getFileId(fnt, 'a/2/5/6')
    if (fileId != null) {
        const fileInfo = fat[fileId]
        const file = buffer.slice(fileInfo.startOffset, fileInfo.endOffset)
        
        console.log(readNarc(file))
    }



    
    // const d112Info = arm9Ovt[112]
    // const compressed = ((d112Info.compression >> 24) & 1) === 1
    // const compressedSize = d112Info.compression & ((1 << 24) - 1)
    // console.log(d112Info, compressed, compressedSize)

    // const d112File = fat[d112Info.fileId]
    // decompressOverlay(buffer.slice(d112File.startOffset, d112File.endOffset))
}