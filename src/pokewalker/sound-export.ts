// Render a parsed sound sequence offline through Web Audio and download
// it as a WAV file. Reuses the same oscillator/gain construction the
// realtime player does, just driven by an OfflineAudioContext so the
// output ends up in a buffer instead of speakers.

import type { ParsedSequence } from './sound'

const SAMPLE_RATE = 44100

export const renderToWav = async (
    parsed: ParsedSequence,
    waveType: OscillatorType,
    volume: number,
    tempoMul: number,
): Promise<Blob> => {
    // Total duration walking the event list once. Mirrors the same accounting
    // playParsed does so the offline buffer is sized exactly right.
    let total = 0.05  // initial silent lead-in
    for (const ev of parsed.events) {
        if (ev.type === 'note') total += (ev.durationSec + ev.gapSec) / tempoMul
        else if (ev.type === 'rest') total += ev.durationSec / tempoMul
    }
    total += 0.05  // small trailing pad

    const ctx = new OfflineAudioContext(1, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE)
    const master = ctx.createGain()
    master.gain.value = volume
    master.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = waveType
    const noteGain = ctx.createGain()
    noteGain.gain.value = 0
    osc.connect(noteGain)
    noteGain.connect(master)

    let t = 0.05
    for (const ev of parsed.events) {
        if (ev.type === 'note') {
            osc.frequency.setValueAtTime(ev.freq, t)
            noteGain.gain.setValueAtTime(1, t)
            t += ev.durationSec / tempoMul
            if (ev.gapSec > 0) {
                noteGain.gain.setValueAtTime(0, t)
                t += ev.gapSec / tempoMul
            }
        } else if (ev.type === 'rest') {
            noteGain.gain.setValueAtTime(0, t)
            t += ev.durationSec / tempoMul
        }
    }
    noteGain.gain.setValueAtTime(0, t)

    osc.start(0.05)
    osc.stop(t + 0.05)

    const buffer = await ctx.startRendering()
    return wavBlob(buffer)
}

// ---- WAV writer -----------------------------------------------------------
// Standard RIFF/WAVE with 16-bit PCM, mono.

const wavBlob = (audio: AudioBuffer): Blob => {
    const samples = audio.getChannelData(0)
    const bytesPerSample = 2
    const dataLen = samples.length * bytesPerSample
    const buf = new ArrayBuffer(44 + dataLen)
    const view = new DataView(buf)

    let off = 0
    const writeStr = (s: string) => { for (const c of s) view.setUint8(off++, c.charCodeAt(0)) }
    const writeU32 = (v: number) => { view.setUint32(off, v, true); off += 4 }
    const writeU16 = (v: number) => { view.setUint16(off, v, true); off += 2 }

    writeStr('RIFF')
    writeU32(36 + dataLen)
    writeStr('WAVE')
    writeStr('fmt ')
    writeU32(16)               // PCM chunk size
    writeU16(1)                // format = PCM
    writeU16(1)                // mono
    writeU32(audio.sampleRate)
    writeU32(audio.sampleRate * bytesPerSample)
    writeU16(bytesPerSample)
    writeU16(16)               // bits per sample
    writeStr('data')
    writeU32(dataLen)

    // Convert float32 [-1,1] → int16, clamped.
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]))
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        off += 2
    }

    return new Blob([buf], { type: 'audio/wav' })
}

export const downloadWav = async (
    parsed: ParsedSequence,
    waveType: OscillatorType,
    volume: number,
    tempoMul: number,
    baseName: string,
): Promise<void> => {
    const blob = await renderToWav(parsed, waveType, volume, tempoMul)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}.wav`
    a.click()
    URL.revokeObjectURL(url)
}
