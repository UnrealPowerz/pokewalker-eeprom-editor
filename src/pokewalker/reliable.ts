// Mirror + checksum logic for the walker's "reliable save" regions.
//
// Each region has a primary copy and a backup copy 0x100 bytes apart, plus
// a one-byte checksum trailing each copy. The checksum is
//   1 + sum(data) mod 256
// (the `1 +` offset matches save_write_reliable() in pw_firm src/system/save.c).
//
// On boot the firmware reads both copies, validates each against its
// checksum, and repairs whichever has gone bad. If both check, but they
// disagree, the primary is canonicalised to the backup's content.
//
// The nice editor tabs always write through setField, which calls
// syncReliable() after each write — so primary↔backup stay in lockstep and
// checksums stay valid. Raw / setBytes intentionally bypass this so the
// user can craft "broken" dumps to test recovery paths.

export type ReliableRegion = {
    name: string
    primary: number   // primary data start offset
    backup: number    // backup data start offset (= primary + 0x100 in practice)
    size: number      // bytes of data; checksum byte lives at +size on each copy
}

export const RELIABLE_REGIONS: readonly ReliableRegion[] = [
    { name: 'accelCal',   primary: 0x0080, backup: 0x0180, size: 2 },
    { name: 'resv_0083',  primary: 0x0083, backup: 0x0183, size: 0x28 },
    { name: 'lcdInitSeq', primary: 0x00AC, backup: 0x01AC, size: 0x40 },
    { name: 'trainerRec', primary: 0x00ED, backup: 0x01ED, size: 0x68 },
    { name: 'saveBlock',  primary: 0x0156, backup: 0x0256, size: 0x18 },
    { name: 'stageMark',  primary: 0x016F, backup: 0x026F, size: 1 },
]

const checksum = (bytes: Uint8Array, start: number, len: number): number => {
    let c = 1
    for (let i = 0; i < len; i++) c = (c + bytes[start + i]) & 0xFF
    return c
}

/**
 * If `modifiedOffset` falls inside any reliable region (primary or backup
 * data block — NOT the trailing checksum byte), recompute the checksum and
 * mirror the data + checksum across to the other copy. Mutates `bytes`
 * in place and returns the set of region names touched.
 */
export const syncReliable = (bytes: Uint8Array, modifiedOffset: number, modifiedLength = 1): string[] => {
    const touched: string[] = []
    const modEnd = modifiedOffset + modifiedLength
    for (const r of RELIABLE_REGIONS) {
        // Range overlap test against either copy's data region.
        const inPrimary = modifiedOffset < r.primary + r.size && modEnd > r.primary
        const inBackup  = modifiedOffset < r.backup  + r.size && modEnd > r.backup
        if (!inPrimary && !inBackup) continue

        // Whichever copy was just edited is authoritative; mirror to the
        // other side, then recompute the checksum from the (now identical)
        // data and stamp it onto both trailing bytes.
        const srcStart = inPrimary ? r.primary : r.backup
        const dstStart = inPrimary ? r.backup  : r.primary
        for (let i = 0; i < r.size; i++) bytes[dstStart + i] = bytes[srcStart + i]
        const c = checksum(bytes, srcStart, r.size)
        bytes[r.primary + r.size] = c
        bytes[r.backup  + r.size] = c
        touched.push(r.name)
    }
    return touched
}

/**
 * Walk the entire reliable-save layout and bring everything into sync.
 * Used at load time so a freshly-loaded dump that has stale backups still
 * presents as "clean" until the user makes a real change. (Returns the
 * count of regions that were out of sync to begin with.)
 */
export const syncAllReliable = (bytes: Uint8Array): number => {
    let fixed = 0
    for (const r of RELIABLE_REGIONS) {
        let differs = false
        for (let i = 0; i < r.size; i++) {
            if (bytes[r.primary + i] !== bytes[r.backup + i]) { differs = true; break }
        }
        const c = checksum(bytes, r.primary, r.size)
        const primaryChkOk = bytes[r.primary + r.size] === c
        const backupChkOk  = bytes[r.backup  + r.size] === c
        if (differs || !primaryChkOk || !backupChkOk) {
            // Treat primary as authoritative on initial sync.
            for (let i = 0; i < r.size; i++) bytes[r.backup + i] = bytes[r.primary + i]
            bytes[r.primary + r.size] = c
            bytes[r.backup  + r.size] = c
            fixed++
        }
    }
    return fixed
}
