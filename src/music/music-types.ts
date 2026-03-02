import { type Seed, type Seconds } from '../types'

// ── Domain aliases ───────────────────────────────────────────

export type BPM = number
export type Energy = number       // 0–1, drives density/intensity
export type Velocity = number     // 0–1
export type NoteName = string     // e.g. 'C2', 'E3'

// ── Event types ──────────────────────────────────────────────

export interface NoteEvent {
    readonly time: Seconds
    readonly note: NoteName
    readonly duration: Seconds
    readonly vel: Velocity
}

export interface ChordEvent {
    readonly time: Seconds
    readonly notes: readonly NoteName[]
    readonly duration: Seconds
    readonly vel: Velocity
}

export interface DrumEvent {
    readonly time: Seconds
    readonly vel: Velocity
}

// ── Composition data ─────────────────────────────────────────

export interface BarData {
    readonly bar: number
    readonly section: string
    readonly energy: Energy
    readonly bpm: BPM
    readonly chordSymbol: string
    readonly numeral: string
    readonly voiced: readonly NoteName[]
}

export interface MusicComposition {
    readonly seed: Seed
    readonly tonic: NoteName
    readonly structureName: string
    readonly orderingName: string
    readonly totalBars: number
    readonly totalTime: Seconds
    readonly bars: readonly BarData[]
    readonly energyCurve: readonly Energy[]
    readonly bpmCurve: readonly BPM[]
    readonly barStartTimes: readonly Seconds[]
    readonly barDurations: readonly Seconds[]
    readonly padEvents: readonly ChordEvent[]
    readonly bassEvents: readonly NoteEvent[]
    readonly kickEvents: readonly DrumEvent[]
    readonly snareEvents: readonly DrumEvent[]
    readonly hatEvents: readonly DrumEvent[]
    readonly arpEvents: readonly NoteEvent[]
    readonly melodyEvents: readonly NoteEvent[]
}

// ── Beat timeline ────────────────────────────────────────────

export interface BeatTimeline {
    readonly beatTimes: readonly Seconds[]
    readonly totalBeats: number
    readonly totalTime: Seconds
}
