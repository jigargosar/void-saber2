import {
    MembraneSynth,
    NoiseSynth,
    MonoSynth,
    Gain,
    Filter,
    start as startTone,
    getDestination,
} from 'tone'
import { type Seconds, type Velocity, type NoteName, type Teardown } from '../types'

export interface AudioEngine {
    start(): Promise<void>
    triggerKick(time?: Seconds, velocity?: Velocity): void
    triggerSnare(time?: Seconds, velocity?: Velocity): void
    triggerHat(time?: Seconds, velocity?: Velocity): void
    triggerBass(note: NoteName, duration: Seconds, time?: Seconds, velocity?: Velocity): void
    dispose: Teardown
}

export function createAudioEngine(): AudioEngine {
    // ── Master gain ────────────────────────────────────────────
    const master = new Gain(1).connect(getDestination())

    // ── Kick — MembraneSynth → master ──────────────────────────
    const kick = new MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.3 },
        volume: -2,
    }).connect(master)

    // ── Snare — NoiseSynth → highpass 1200 Hz → master ─────────
    const snareFilter = new Filter(1200, 'highpass').connect(master)
    const snare = new NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
        volume: -6,
    }).connect(snareFilter)

    // ── Hi-hat — NoiseSynth → highpass 8000 Hz → master ────────
    const hatFilter = new Filter(8000, 'highpass').connect(master)
    const hat = new NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
        volume: -10,
    }).connect(hatFilter)

    // ── Bass — MonoSynth → lowpass 800 Hz (-12 dB/oct) → master
    const bassFilter = new Filter(800, 'lowpass', -12).connect(master)
    const bass = new MonoSynth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.3 },
        filterEnvelope: {
            attack: 0.005,
            decay: 0.08,
            sustain: 0.4,
            release: 0.2,
            baseFrequency: 150,
            octaves: 2.5,
        },
        volume: -4,
    }).connect(bassFilter)

    // ── Public API ─────────────────────────────────────────────

    function start(): Promise<void> {
        return startTone()
    }

    function triggerKick(time?: Seconds, velocity?: Velocity): void {
        kick.triggerAttackRelease('C1', '8n', time, velocity)
    }

    function triggerSnare(time?: Seconds, velocity?: Velocity): void {
        snare.triggerAttackRelease('16n', time, velocity)
    }

    function triggerHat(time?: Seconds, velocity?: Velocity): void {
        hat.triggerAttackRelease('32n', time, velocity)
    }

    function triggerBass(note: NoteName, duration: Seconds, time?: Seconds, velocity?: Velocity): void {
        bass.triggerAttackRelease(note, duration, time, velocity)
    }

    function dispose(): void {
        // Synths first, then effects, then master
        kick.dispose()
        snare.dispose()
        hat.dispose()
        bass.dispose()
        snareFilter.dispose()
        hatFilter.dispose()
        bassFilter.dispose()
        master.dispose()
    }

    return { start, triggerKick, triggerSnare, triggerHat, triggerBass, dispose }
}
