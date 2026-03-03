import {
    PolySynth, Synth, MonoSynth, MembraneSynth, NoiseSynth,
    Gain, Filter, Chorus, Reverb,
    Part, start as startTone, getTransport, getDraw, getDestination,
} from 'tone'
import { type Seconds, type Teardown } from '../types'
import { type CommandQueue } from '../command-queue'
import { type MusicComposition, type ChordEvent, type NoteEvent, type DrumEvent } from './music-types'

// Transport BPM is fixed — actual timing is pre-baked into absolute event times
const TRANSPORT_BPM = 128
// Seconds of silence after song ends before full stop
const TAIL_SECONDS = 1.5
// ── Public interface ─────────────────────────────────────────

export interface MusicPlayer {
    start(): Promise<void>
    stop(): void
    currentTime(): Seconds
    dispose: Teardown
}

export function createMusicPlayer(
    composition: MusicComposition,
    onBeat: () => void,
    queue: CommandQueue,
): MusicPlayer {
    const transport = getTransport()
    const parts: Part[] = []

    // ── Master gain ──────────────────────────────────────────

    const master = new Gain(0.25).connect(getDestination())

    // ── Pad ──────────────────────────────────────────────────

    const padChorus = new Chorus({ frequency: 0.4, delayTime: 3.5, depth: 0.5, wet: 0.3 }).start()
    const padFilter = new Filter({ frequency: 1200, type: 'lowpass', rolloff: -12 })
    const padReverb = new Reverb({ decay: 3, wet: 0.25 })
    const pad = new PolySynth(Synth, {
        oscillator: { type: 'fatsawtooth', count: 2, spread: 15 },
        envelope: { attack: 0.3, decay: 0.2, sustain: 0.4, release: 0.8 },
        volume: -10,
    })
    pad.chain(padChorus, padFilter, padReverb, master)

    // ── Bass ─────────────────────────────────────────────────

    const bassFilter = new Filter({ frequency: 800, type: 'lowpass', rolloff: -12 })
    const bass = new MonoSynth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.3 },
        filterEnvelope: { attack: 0.005, decay: 0.08, sustain: 0.4, release: 0.2, baseFrequency: 150, octaves: 2.5 },
        volume: -4,
    })
    bass.chain(bassFilter, master)

    // ── Kick ─────────────────────────────────────────────────

    const kick = new MembraneSynth({
        pitchDecay: 0.05, octaves: 6,
        envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.3 },
        volume: -2,
    })
    kick.connect(master)

    // ── Snare ────────────────────────────────────────────────

    const snareFilter = new Filter({ frequency: 1200, type: 'highpass' })
    const snare = new NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
        volume: -6,
    })
    snare.chain(snareFilter, master)

    // ── Hat ──────────────────────────────────────────────────

    const hatFilter = new Filter({ frequency: 8000, type: 'highpass' })
    const hat = new NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
        volume: -10,
    })
    hat.chain(hatFilter, master)

    // ── Arp ──────────────────────────────────────────────────

    const arpFilter = new Filter({ frequency: 3000, type: 'lowpass' })
    const arpReverb = new Reverb({ decay: 1, wet: 0.2 })
    const arp = new PolySynth(Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.003, decay: 0.1, sustain: 0.05, release: 0.15 },
        volume: -8,
    })
    arp.chain(arpFilter, arpReverb, master)

    // ── Melody ───────────────────────────────────────────────

    const melodyFilter = new Filter({ frequency: 2200, type: 'lowpass' })
    const melodyReverb = new Reverb({ decay: 1.5, wet: 0.3 })
    const melody = new Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.25, release: 0.3 },
        volume: -6,
    })
    melody.chain(melodyFilter, melodyReverb, master)

    // ── Schedule events via Tone.Part ────────────────────────

    if (composition.padEvents.length > 0) {
        const padPart = new Part((time, e: ChordEvent) => {
            pad.triggerAttackRelease(e.notes as string[], e.duration, time, e.vel)
        }, composition.padEvents.map(e => ({ ...e })))
        padPart.start(0)
        parts.push(padPart)
    }

    if (composition.bassEvents.length > 0) {
        const bassPart = new Part((time, e: NoteEvent) => {
            bass.triggerAttackRelease(e.note, e.duration, time, e.vel)
        }, composition.bassEvents.map(e => ({ ...e })))
        bassPart.start(0)
        parts.push(bassPart)
    }

    if (composition.kickEvents.length > 0) {
        const kickPart = new Part((time, e: DrumEvent) => {
            kick.triggerAttackRelease('C1', '8n', time, e.vel)
            // Fire onBeat on the animation frame for visual sync
            getDraw().schedule(onBeat, time)
        }, composition.kickEvents.map(e => ({ ...e })))
        kickPart.start(0)
        parts.push(kickPart)
    }

    if (composition.snareEvents.length > 0) {
        const snarePart = new Part((time, e: DrumEvent) => {
            snare.triggerAttackRelease('16n', time, e.vel)
        }, composition.snareEvents.map(e => ({ ...e })))
        snarePart.start(0)
        parts.push(snarePart)
    }

    if (composition.hatEvents.length > 0) {
        const hatPart = new Part((time, e: DrumEvent) => {
            hat.triggerAttackRelease('32n', time, e.vel)
        }, composition.hatEvents.map(e => ({ ...e })))
        hatPart.start(0)
        parts.push(hatPart)
    }

    if (composition.arpEvents.length > 0) {
        const arpPart = new Part((time, e: NoteEvent) => {
            arp.triggerAttackRelease(e.note, e.duration, time, e.vel)
        }, composition.arpEvents.map(e => ({ ...e })))
        arpPart.start(0)
        parts.push(arpPart)
    }

    if (composition.melodyEvents.length > 0) {
        const melodyPart = new Part((time, e: NoteEvent) => {
            melody.triggerAttackRelease(e.note, e.duration, time, e.vel)
        }, composition.melodyEvents.map(e => ({ ...e })))
        melodyPart.start(0)
        parts.push(melodyPart)
    }

    // ── Master fade on last bar ──────────────────────────────

    const lastBarDur = composition.barDurations[composition.totalBars - 1]
    transport.schedule((time) => {
        master.gain.setValueAtTime(1, time)
        master.gain.linearRampToValueAtTime(0, time + lastBarDur)
    }, composition.totalTime - lastBarDur)

    // ── Auto-stop after song ends ────────────────────────────

    transport.schedule(() => {
        stop()
        queue.enqueue({ type: 'arenaSessionCompleted' })
    }, composition.totalTime + TAIL_SECONDS)

    // ── Transport config ─────────────────────────────────────

    transport.bpm.value = TRANSPORT_BPM

    // ── Public API ───────────────────────────────────────────

    async function start(): Promise<void> {
        await startTone()
        transport.start()
    }

    function stop(): void {
        transport.stop()
        transport.cancel()
    }

    function dispose(): void {
        stop()
        // Parts first
        for (const p of parts) p.dispose()
        // Synths
        pad.dispose()
        bass.dispose()
        kick.dispose()
        snare.dispose()
        hat.dispose()
        arp.dispose()
        melody.dispose()
        // Effects
        padChorus.dispose()
        padFilter.dispose()
        padReverb.dispose()
        bassFilter.dispose()
        snareFilter.dispose()
        hatFilter.dispose()
        arpFilter.dispose()
        arpReverb.dispose()
        melodyFilter.dispose()
        melodyReverb.dispose()
        // Master last
        master.dispose()
    }

    function currentTime(): Seconds {
        return transport.seconds
    }

    return { start, stop, currentTime, dispose }
}
