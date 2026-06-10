import { describe, it, expect } from 'vitest'
import { syncReliable, RELIABLE_REGIONS } from './reliable'

const blockChecksum = (bytes: Uint8Array, start: number, len: number): number => {
    let c = 1
    for (let i = 0; i < len; i++) c = (c + bytes[start + i]) & 0xFF
    return c
}

describe('syncReliable', () => {
    it('mirrors primary→backup and stamps the correct checksum on both', () => {
        const region = RELIABLE_REGIONS.find((r) => r.name === 'saveBlock')!
        const bytes = new Uint8Array(0x10000)
        // Write a non-trivial pattern in the primary; backup left zero.
        for (let i = 0; i < region.size; i++) bytes[region.primary + i] = (i * 17) & 0xFF
        // Sanity: backup and checksums are wrong before sync.
        expect(bytes[region.backup + 0]).toBe(0)
        expect(bytes[region.primary + region.size]).toBe(0)

        const touched = syncReliable(bytes, region.primary)
        expect(touched).toContain('saveBlock')

        const expected = blockChecksum(bytes, region.primary, region.size)
        expect(bytes[region.primary + region.size]).toBe(expected)
        expect(bytes[region.backup + region.size]).toBe(expected)
        for (let i = 0; i < region.size; i++) {
            expect(bytes[region.backup + i]).toBe(bytes[region.primary + i])
        }
    })

    it('treats a write to the backup copy as authoritative if that\'s where the modification was', () => {
        const region = RELIABLE_REGIONS.find((r) => r.name === 'trainerRec')!
        const bytes = new Uint8Array(0x10000)
        // Put data in BACKUP; primary remains zero.
        for (let i = 0; i < region.size; i++) bytes[region.backup + i] = 0xA5
        syncReliable(bytes, region.backup)
        for (let i = 0; i < region.size; i++) {
            expect(bytes[region.primary + i]).toBe(0xA5)
        }
        const expected = blockChecksum(bytes, region.backup, region.size)
        expect(bytes[region.primary + region.size]).toBe(expected)
        expect(bytes[region.backup + region.size]).toBe(expected)
    })

    it('is a no-op for offsets outside every reliable region', () => {
        const bytes = new Uint8Array(0x10000)
        bytes[0x8000] = 0xFF   // somewhere in the sprite region
        const before = new Uint8Array(bytes)
        const touched = syncReliable(bytes, 0x8000)
        expect(touched).toEqual([])
        expect(bytes).toEqual(before)
    })

    it('handles multi-byte field writes that overlap a region boundary', () => {
        const region = RELIABLE_REGIONS.find((r) => r.name === 'saveBlock')!
        const bytes = new Uint8Array(0x10000)
        // Span a 4-byte field that ends in the last byte of saveBlock.
        const start = region.primary + region.size - 4
        for (let i = 0; i < 4; i++) bytes[start + i] = 0xDE
        const touched = syncReliable(bytes, start, 4)
        expect(touched).toContain('saveBlock')
        for (let i = 0; i < 4; i++) {
            expect(bytes[region.backup + (start - region.primary) + i]).toBe(0xDE)
        }
    })
})
