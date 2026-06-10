import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from './spec';
import { loadPokeEncoding } from './poke-encoding';

const PUBLIC_DIR = resolve(__dirname, '../../public');

/**
 * Load all .bin dumps from public/ — these are the test corpus. If we add
 * more dumps later, they get covered automatically.
 */
const loadDumps = (): { name: string; data: Uint8Array }[] => {
    const dumps: { name: string; data: Uint8Array }[] = [];
    const names = [
        'eeprom.bin',
        'jp_eep.bin',
        'spiky_ear_eeprom.bin',
        'zenith_eeprom.bin',
        // half_eeprom.bin is a corrupted/wiped dump — skip it. Its
        // bytes still round-trip but the parsed values are nonsense
        // and Uint8Array equality is still satisfied so it's fine to
        // include, actually.
        'half_eeprom.bin',
    ];
    for (const name of names) {
        try {
            const buf = readFileSync(resolve(PUBLIC_DIR, name));
            const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            // Pad short dumps to a full 64KB so the parser doesn't read past
            // end of buffer.
            if (u8.length < 0x10000) {
                const padded = new Uint8Array(0x10000);
                padded.set(u8);
                padded.fill(0xff, u8.length);
                dumps.push({ name, data: padded });
            } else {
                dumps.push({ name, data: u8 });
            }
        } catch {
            // Skip missing files (CI / fresh clones might not have them)
        }
    }
    return dumps;
};

describe('format round-trip', () => {
    beforeAll(async () => {
        await loadPokeEncoding();
    });

    const dumps = loadDumps();

    if (dumps.length === 0) {
        it.skip('no dumps available in public/', () => {});
        return;
    }

    for (const dump of dumps) {
        it(`${dump.name} round-trips byte-exact`, () => {
            const inView = new DataView(dump.data.buffer, dump.data.byteOffset, dump.data.byteLength);
            const parsed = format.read(inView, 0);

            const out = new Uint8Array(format.length);
            const outView = new DataView(out.buffer);
            format.write(outView, 0, parsed);

            // Compare byte by byte and report the first few mismatches if any
            const mismatches: { offset: string; in: number; out: number }[] = [];
            for (let i = 0; i < format.length; i++) {
                if (dump.data[i] !== out[i]) {
                    if (mismatches.length < 10) {
                        mismatches.push({
                            offset: '0x' + i.toString(16).padStart(4, '0').toUpperCase(),
                            in: dump.data[i],
                            out: out[i],
                        });
                    }
                }
            }
            expect(mismatches, `${dump.name} mismatches`).toEqual([]);
        });
    }

    it('format.length is 0x10000', () => {
        expect(format.length).toBe(0x10000);
    });
});
