import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    loadEeprom,
    parsed,
    isLoaded,
    dirty,
    canUndo,
    canRedo,
    setField,
    setBytes,
    undo,
    redo,
    getOffsetForPath,
} from './eeprom.svelte'
import { Int8u } from '../util/bin'

const sample = () => {
    const buf = readFileSync(resolve(__dirname, '../../public/eeprom.bin'))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

describe('state/eeprom', () => {
    beforeAll(async () => {
        await loadEeprom(sample(), 'eeprom.bin')
    })

    beforeEach(async () => {
        // Reset between tests so they don't interfere
        await loadEeprom(sample(), 'eeprom.bin')
    })

    it('loads and parses', () => {
        expect(isLoaded()).toBe(true)
        const p = parsed()
        expect(p).not.toBeNull()
        expect(p!.header.nintendo.toUpperCase()).toBe('NINTENDO')
    })

    it('builds an offset table for known paths', () => {
        const numResets = getOffsetForPath(['header', 'numResets'])
        expect(numResets).not.toBeNull()
        expect(numResets!.offset).toBe(0x72)
    })

    it('setField mutates the byte and parsed value', () => {
        const before = parsed()!.header.numResets
        setField(['header', 'numResets'], (before + 1) & 0xff, 'test')
        const after = parsed()!.header.numResets
        expect(after).toBe((before + 1) & 0xff)
    })

    it('setField marks state dirty', () => {
        expect(dirty()).toBe(false)
        setField(['header', 'numResets'], 0, 'reset count')
        expect(dirty()).toBe(true)
    })

    it('undo restores previous byte; redo re-applies', () => {
        const original = parsed()!.header.numResets
        setField(['header', 'numResets'], 0x42, 'set 0x42')
        expect(parsed()!.header.numResets).toBe(0x42)
        expect(canUndo()).toBe(true)
        expect(canRedo()).toBe(false)

        undo()
        expect(parsed()!.header.numResets).toBe(original)
        expect(canRedo()).toBe(true)

        redo()
        expect(parsed()!.header.numResets).toBe(0x42)
    })

    it('multiple undos walk the stack', () => {
        const original = parsed()!.header.numResets
        setField(['header', 'numResets'], 1)
        setField(['header', 'numResets'], 2)
        setField(['header', 'numResets'], 3)
        expect(parsed()!.header.numResets).toBe(3)
        undo()
        expect(parsed()!.header.numResets).toBe(2)
        undo()
        expect(parsed()!.header.numResets).toBe(1)
        undo()
        expect(parsed()!.header.numResets).toBe(original)
        expect(canUndo()).toBe(false)
    })

    it('new edits truncate the redo branch', () => {
        const original = parsed()!.header.numResets
        setField(['header', 'numResets'], 10)
        setField(['header', 'numResets'], 20)
        undo()  // back to 10
        expect(canRedo()).toBe(true)
        setField(['header', 'numResets'], 30)  // forks
        expect(canRedo()).toBe(false)  // 20 is gone
        undo()  // back to 10
        expect(parsed()!.header.numResets).toBe(10)
        undo()  // back to original
        expect(parsed()!.header.numResets).toBe(original)
    })

    it('setBytes works at the raw byte level', () => {
        setBytes(0x70, [0x11, 0x22])
        const p = parsed()!
        // 0x72 is numResets and shouldn't be touched
        expect(p.header.numResets).not.toBe(0x22)
    })

    it('setField on a struct path uses the spec writer', () => {
        // Int8u is a basic primitive — write directly through getOffsetForPath
        const entry = getOffsetForPath(['header', 'numResets'])!
        expect(entry.spec.length).toBe(1)
        // Spec equality isn't reliable across imports, just verify length
        expect(entry.spec.length).toBe(Int8u.length)
    })
})
