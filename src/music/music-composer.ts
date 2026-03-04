import { Note, Scale, Progression, Voicing, VoiceLeading, VoicingDictionary } from 'tonal'
import { type Seconds } from '../types'
import { type RhythmGrid } from './rhythm-grid'

// ── Domain aliases ───────────────────────────────────────────

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

// ── Composition data (events only — structural data lives in RhythmGrid) ──

export interface BarVoicing {
    readonly bar: number
    readonly chordSymbol: string
    readonly numeral: string
    readonly voiced: readonly NoteName[]
}

export interface MusicComposition {
    readonly orderingName: string
    readonly tonic: NoteName
    readonly barVoicings: readonly BarVoicing[]
    readonly padEvents: readonly ChordEvent[]
    readonly bassEvents: readonly NoteEvent[]
    readonly kickEvents: readonly DrumEvent[]
    readonly snareEvents: readonly DrumEvent[]
    readonly hatEvents: readonly DrumEvent[]
    readonly arpEvents: readonly NoteEvent[]
    readonly melodyEvents: readonly NoteEvent[]
}

// ── Seeded RNG (composer-local, independent of grid RNG) ─────

function createComposerRng(seed: number) {
    let s = (seed * 3) % 2147483647 || 1 // derive different sequence from same seed
    function rng(): number {
        s = (s * 16807) % 2147483647
        return (s - 1) / 2147483646
    }
    function rngInt(min: number, max: number): number {
        return min + Math.floor(rng() * (max - min + 1))
    }
    function pick<T>(arr: readonly T[]): T {
        return arr[Math.floor(rng() * arr.length)]
    }
    return { rng, rngInt, pick }
}

// ── Constants ────────────────────────────────────────────────

const KEY_POOL = ['C', 'D', 'E', 'F', 'G', 'A'] as const
const VOICE_RANGE: [string, string] = ['C3', 'C5']
const MIN_VEL = 0.03

// ── Markov Transition Matrix ─────────────────────────────────

type Numeral = 'Im' | 'bIII' | 'IVm' | 'Vm' | 'bVI' | 'bVII'

const MARKOV: Record<Numeral, readonly (readonly [Numeral, number])[]> = {
    'Im':   [['bIII', 2], ['IVm', 3], ['Vm', 1], ['bVI', 3], ['bVII', 2]],
    'bIII': [['Im', 1],   ['IVm', 3], ['bVI', 2], ['bVII', 3]],
    'IVm':  [['Im', 2],   ['bIII', 1], ['Vm', 2], ['bVI', 1], ['bVII', 3]],
    'Vm':   [['Im', 3],   ['IVm', 1], ['bVI', 3]],
    'bVI':  [['Im', 1],   ['bIII', 2], ['IVm', 2], ['bVII', 3]],
    'bVII': [['Im', 3],   ['bIII', 2], ['IVm', 1], ['bVI', 2]],
}

function markovNext(current: Numeral, rng: () => number): Numeral {
    const transitions = MARKOV[current]
    const totalWeight = transitions.reduce((sum, [, w]) => sum + w, 0)
    let r = rng() * totalWeight
    for (const [target, weight] of transitions) {
        r -= weight
        if (r <= 0) return target
    }
    return transitions[transitions.length - 1][0]
}

function generatePhrase(rng: () => number): Numeral[] {
    const walk: Numeral[] = ['Im']
    for (let i = 1; i < 4; i++) walk.push(markovNext(walk[i - 1], rng))
    return walk
}

// ── Voice Leading ────────────────────────────────────────────

function minimalMovement(voicings: string[][], lastVoicing: string[] | null): string[] {
    if (!lastVoicing || lastVoicing.length === 0) return voicings[0]
    const movement = (v: string[]) =>
        v.reduce((sum, note, i) => {
            const prev = i < lastVoicing.length ? lastVoicing[i] : lastVoicing[lastVoicing.length - 1]
            return sum + Math.abs((Note.midi(note) ?? 0) - (Note.midi(prev) ?? 0))
        }, 0)
    return voicings.slice().sort((a, b) => movement(a) - movement(b))[0]
}

// ── Drum Patterns (8 steps per bar) ──────────────────────────

type EnergyLevel = 'low' | 'mid' | 'high' | 'peak'
type DrumPatternSet = Record<EnergyLevel, readonly (readonly number[])[]>

const KICK_PATTERNS: DrumPatternSet = {
    low:  [[1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 1, 0, 0, 0]],
    mid:  [[1, 0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 0, 0, 1, 0], [1, 0, 1, 0, 0, 0, 0, 0]],
    high: [[1, 0, 0, 0, 1, 0, 1, 0], [1, 0, 1, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0, 0, 0]],
    peak: [[1, 0, 1, 0, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 1, 0], [1, 1, 0, 0, 1, 0, 1, 0]],
}
const SNARE_PATTERNS: DrumPatternSet = {
    low:  [[0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 1, 0, 0, 0]],
    mid:  [[0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 1, 0, 0, 1], [0, 0, 1, 0, 0, 0, 1, 0]],
    high: [[0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 1, 0, 0, 1], [0, 0, 1, 0, 1, 0, 0, 0]],
    peak: [[0, 0, 0, 0, 1, 0, 0, 1], [0, 0, 1, 0, 1, 0, 0, 1], [0, 0, 0, 1, 1, 0, 1, 0]],
}
const HAT_PATTERNS: DrumPatternSet = {
    low:  [[1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0, 0], [0, 0, 1, 0, 0, 0, 1, 0]],
    mid:  [[1, 0, 1, 0, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 0, 1], [1, 1, 0, 0, 1, 1, 0, 0]],
    high: [[1, 1, 1, 1, 1, 1, 1, 0], [1, 1, 1, 0, 1, 1, 1, 1], [1, 0, 1, 1, 1, 0, 1, 1]],
    peak: [[1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1, 1, 0]],
}

function energyLevel(energy: number): EnergyLevel {
    if (energy < 0.25) return 'low'
    if (energy < 0.55) return 'mid'
    if (energy < 0.85) return 'high'
    return 'peak'
}

// ── Arp Patterns ─────────────────────────────────────────────

type ArpStyle = 'up' | 'down' | 'updown' | 'non-sequential'
const ARP_STYLES: readonly ArpStyle[] = ['up', 'down', 'updown', 'non-sequential']

function generateArpPattern(chordNotes: string[], style: ArpStyle, energy: number, rng: () => number): (string | null)[] {
    const steps: (string | null)[] = []
    const len = chordNotes.length
    for (let step = 0; step < 8; step++) {
        if (rng() > (0.2 + energy * 0.5)) { steps.push(null); continue }
        let idx: number
        if (style === 'up') idx = step % len
        else if (style === 'down') idx = (len - 1) - (step % len)
        else if (style === 'updown') {
            const cycle = Math.max(1, len * 2 - 2)
            const pos = step % cycle
            idx = pos < len ? pos : cycle - pos
        } else {
            idx = Math.floor(rng() * len)
        }
        steps.push(chordNotes[Math.min(idx, len - 1)])
    }
    return steps
}

// ── Melody Motif ─────────────────────────────────────────────

function generateMotif(scaleNotes: string[], length: number, rng: () => number, rngInt: (min: number, max: number) => number): number[] {
    const motif: number[] = []
    let degree = rngInt(0, scaleNotes.length - 1)
    for (let i = 0; i < length; i++) {
        motif.push(degree)
        if (rng() < 0.7) degree += rng() < 0.5 ? 1 : -1
        else degree += rngInt(-2, 2)
        degree = Math.max(0, Math.min(scaleNotes.length * 2 - 1, degree))
    }
    return motif
}

function varyMotif(motif: number[], amount: number, rng: () => number, rngInt: (min: number, max: number) => number): number[] {
    return motif.map(d => rng() < amount ? d + rngInt(-1, 1) : d)
}

function degreeToNote(scaleNotes: string[], degree: number, octaveBase: number): string {
    const len = scaleNotes.length
    const oct = Math.floor(degree / len)
    const idx = ((degree % len) + len) % len
    return scaleNotes[idx] + (octaveBase + oct)
}

// ── Sigmoid Instrument Activation ────────────────────────────

type InstrumentName = 'pad' | 'bass' | 'kick' | 'snare' | 'hat' | 'arp' | 'melody'

function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)) }

const ORDERINGS: readonly (readonly InstrumentName[])[] = [
    ['pad', 'bass', 'hat', 'kick', 'arp', 'snare', 'melody'],
    ['arp', 'hat', 'pad', 'bass', 'kick', 'snare', 'melody'],
    ['bass', 'kick', 'hat', 'pad', 'snare', 'arp', 'melody'],
    ['hat', 'pad', 'bass', 'kick', 'arp', 'snare', 'melody'],
    ['melody', 'pad', 'arp', 'bass', 'hat', 'kick', 'snare'],
]
const ORDERING_NAMES = ['Classic', 'Arp Lead', 'Bass Heavy', 'Rhythm First', 'Melodic'] as const

const SLOT_THRESHOLDS = [0.05, 0.18, 0.30, 0.42, 0.55, 0.68, 0.82] as const
const SLOT_SMOOTHNESS = [0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08] as const

function computeVolumes(energy: number, ordering: readonly InstrumentName[]): Record<InstrumentName, number> {
    const vols = {} as Record<InstrumentName, number>
    for (let i = 0; i < ordering.length; i++) {
        vols[ordering[i]] = sigmoid((energy - SLOT_THRESHOLDS[i]) / SLOT_SMOOTHNESS[i])
    }
    return vols
}

// ── Dedup (Tone.Part requires strictly ascending times) ──────

function dedupDrum(events: DrumEvent[]): DrumEvent[] {
    events.sort((a, b) => a.time - b.time)
    return events.filter((e, i) => i === 0 || e.time > events[i - 1].time)
}

function dedupNote(events: NoteEvent[]): NoteEvent[] {
    events.sort((a, b) => a.time - b.time)
    return events.filter((e, i) => i === 0 || e.time > events[i - 1].time)
}

function dedupChord(events: ChordEvent[]): ChordEvent[] {
    events.sort((a, b) => a.time - b.time)
    return events.filter((e, i) => i === 0 || e.time > events[i - 1].time)
}

// ── Main: composeMusic ───────────────────────────────────────

export function composeMusic(grid: RhythmGrid): MusicComposition {
    const { rng, rngInt, pick } = createComposerRng(grid.seed)

    const tonic = pick(KEY_POOL)

    // 4-chord Markov phrase
    const phrase = generatePhrase(rng)
    const chordSymbols = Progression.fromRomanNumerals(tonic, phrase)

    // Voice chords with minimal movement
    const dictionary = VoicingDictionary.triads
    let lastVoicing: string[] | null = null
    const phraseVoicings: string[][] = []
    for (const symbol of chordSymbols) {
        const candidates = Voicing.search(symbol, VOICE_RANGE, dictionary)
        if (candidates.length === 0) {
            const v = Voicing.get(symbol, VOICE_RANGE, dictionary, VoiceLeading.topNoteDiff, lastVoicing ?? undefined)
            phraseVoicings.push(v)
            lastVoicing = v
        } else {
            const chosen = minimalMovement(candidates, lastVoicing)
            phraseVoicings.push(chosen)
            lastVoicing = chosen
        }
    }

    const scaleNotes = Scale.get(tonic + ' minor').notes

    // Per-song random choices
    const arpStyle = pick(ARP_STYLES)
    const motifLen = pick([4, 5, 6, 8])
    const baseMotif = generateMotif(scaleNotes, motifLen, rng, rngInt)
    const drumChoices: Record<EnergyLevel, number> = {
        low: rngInt(0, 2), mid: rngInt(0, 2),
        high: rngInt(0, 2), peak: rngInt(0, 2),
    }

    // Instrument ordering
    const orderIdx = Math.floor(rng() * ORDERINGS.length)
    const ordering = ORDERINGS[orderIdx]
    const orderingName = ORDERING_NAMES[orderIdx]

    // Build bar voicings
    const barVoicings: BarVoicing[] = []
    for (let i = 0; i < grid.totalBars; i++) {
        const phraseIdx = i % 4
        barVoicings.push({
            bar: i,
            chordSymbol: chordSymbols[phraseIdx],
            numeral: phrase[phraseIdx],
            voiced: phraseVoicings[phraseIdx],
        })
    }

    // Melody rhythm pattern
    const melodyRhythm: boolean[] = []
    for (let i = 0; i < motifLen; i++) melodyRhythm.push(i === 0 || rng() < 0.5)

    // Pre-compute ALL events — reads timing from grid
    const padEvents: ChordEvent[] = []
    const bassEvents: NoteEvent[] = []
    const kickEvents: DrumEvent[] = []
    const snareEvents: DrumEvent[] = []
    const hatEvents: DrumEvent[] = []
    const arpEvents: NoteEvent[] = []
    const melodyEvents: NoteEvent[] = []

    let currentMotif = baseMotif
    let melodyStepCounter = 0

    for (let barIdx = 0; barIdx < grid.totalBars; barIdx++) {
        const barTime = grid.barStartTimes[barIdx]
        const barSec = grid.barDurations[barIdx]
        const beatSec = barSec / 4
        const stepSec = beatSec / 2
        const energy = grid.energyCurve[barIdx]
        const level = energyLevel(energy)
        const vols = computeVolumes(energy, ordering)
        const voicing = barVoicings[barIdx]

        const nextEnergy = barIdx < grid.totalBars - 1 ? grid.energyCurve[barIdx + 1] : energy
        const isTransition = Math.abs(nextEnergy - energy) > 0.06
        const isPhraseLast = (barIdx + 1) % 4 === 0

        // Pad
        if (vols.pad > MIN_VEL) {
            padEvents.push({
                time: barTime,
                notes: voicing.voiced,
                duration: barSec * 1.1,
                vel: vols.pad,
            })
        }

        // Bass
        if (vols.bass > MIN_VEL) {
            const rootNote = voicing.voiced[0]
            const rootMidi = Note.midi(rootNote)
            if (rootMidi !== null) {
                const bassNote = Note.fromMidi(rootMidi - 12)

                if (energy < 0.4) {
                    bassEvents.push({ time: barTime, note: bassNote, duration: barSec * 0.9, vel: vols.bass })
                } else if (energy < 0.7) {
                    bassEvents.push({ time: barTime, note: bassNote, duration: beatSec * 1.8, vel: vols.bass })
                    bassEvents.push({ time: barTime + beatSec * 2, note: bassNote, duration: beatSec * 1.8, vel: vols.bass })
                } else {
                    const chordMidis = voicing.voiced
                        .map(n => Note.midi(n))
                        .filter((m): m is number => m !== null)
                        .map(m => m - 12)
                    for (let step = 0; step < 8; step++) {
                        if (rng() < 0.7 && chordMidis.length > 0) {
                            const midi = pick(chordMidis)
                            bassEvents.push({
                                time: barTime + step * stepSec,
                                note: Note.fromMidi(midi),
                                duration: stepSec * 0.8,
                                vel: vols.bass,
                            })
                        }
                    }
                }
            }
        }

        // Drums
        const kickPat = KICK_PATTERNS[level][drumChoices[level]]
        const snarePat = SNARE_PATTERNS[level][drumChoices[level]]
        const hatPat = HAT_PATTERNS[level][drumChoices[level]]

        for (let step = 0; step < 8; step++) {
            const t = barTime + step * stepSec
            if (kickPat[step] && vols.kick > MIN_VEL)
                kickEvents.push({ time: t, vel: vols.kick })
            if (snarePat[step] && vols.snare > MIN_VEL)
                snareEvents.push({ time: t, vel: vols.snare })
            if (hatPat[step] && vols.hat > MIN_VEL)
                hatEvents.push({ time: t, vel: vols.hat })
        }

        // Drum fill
        if (isTransition && isPhraseLast && vols.snare > 0.1) {
            for (let step = 5; step < 8; step++) {
                snareEvents.push({
                    time: barTime + step * stepSec,
                    vel: vols.snare * (0.5 + (step - 5) * 0.2),
                })
            }
        }

        // Arp
        if (vols.arp > MIN_VEL) {
            const arpNotes = voicing.voiced
                .map(n => Note.midi(n))
                .filter((m): m is number => m !== null)
                .map(m => Note.fromMidi(m + 12))
            const pattern = generateArpPattern(arpNotes, arpStyle, energy, rng)
            for (let step = 0; step < 8; step++) {
                const patNote = pattern[step]
                if (patNote !== null) {
                    arpEvents.push({
                        time: barTime + step * stepSec,
                        note: patNote,
                        duration: stepSec * 0.5,
                        vel: vols.arp,
                    })
                }
            }
        }

        // Melody
        if (vols.melody > MIN_VEL) {
            if (melodyStepCounter > 0 && melodyStepCounter % 16 === 0) {
                currentMotif = rng() < 0.3 ? baseMotif : varyMotif(baseMotif, 0.3, rng, rngInt)
            }
            for (let step = 0; step < 8; step++) {
                const motifIdx = melodyStepCounter % motifLen
                melodyStepCounter++
                if (!melodyRhythm[motifIdx]) continue
                if (rng() > 0.4 + energy * 0.4) continue
                const note = degreeToNote(scaleNotes, currentMotif[motifIdx], 5)
                melodyEvents.push({
                    time: barTime + step * stepSec,
                    note,
                    duration: stepSec * 1.2,
                    vel: vols.melody,
                })
            }
        } else {
            melodyStepCounter += 8
        }
    }

    return {
        orderingName,
        tonic,
        barVoicings,
        padEvents: dedupChord(padEvents),
        bassEvents: dedupNote(bassEvents),
        kickEvents: dedupDrum(kickEvents),
        snareEvents: dedupDrum(snareEvents),
        hatEvents: dedupDrum(hatEvents),
        arpEvents: dedupNote(arpEvents),
        melodyEvents: dedupNote(melodyEvents),
    }
}
