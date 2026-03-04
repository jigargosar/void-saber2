import { Note, Scale, Progression, Voicing, VoiceLeading, VoicingDictionary } from 'tonal'
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

// ── Seeded RNG ───────────────────────────────────────────────

let _seed = 42

function seedRng(s: number): void { _seed = s }
function rng(): number { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646 }
function rngInt(min: number, max: number): number { return min + Math.floor(rng() * (max - min + 1)) }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rng() * arr.length)] }

// ── Constants ────────────────────────────────────────────────

const BPM_CENTER = 128
const BPM_RANGE = 12
const KEY_POOL = ['C', 'D', 'E', 'F', 'G', 'A'] as const
const VOICE_RANGE: [string, string] = ['C3', 'C5']
const MIN_VEL = 0.03

// ── Song Structures ──────────────────────────────────────────

interface SectionDef {
    readonly name: string
    readonly bars: number
    readonly energy: Energy
}

const STRUCTURE_NAMES = ['Standard', 'Slow Burn', 'Energetic', 'Minimal', 'Epic'] as const

const STRUCTURES: readonly (readonly SectionDef[])[] = [
    [
        { name: 'intro', bars: 4, energy: 0.15 }, { name: 'build', bars: 4, energy: 0.45 },
        { name: 'main', bars: 8, energy: 0.75 },  { name: 'break', bars: 4, energy: 0.3 },
        { name: 'peak', bars: 8, energy: 1.0 },   { name: 'outro', bars: 4, energy: 0.1 },
    ],
    [
        { name: 'intro', bars: 4, energy: 0.1 },  { name: 'intro2', bars: 4, energy: 0.2 },
        { name: 'build', bars: 4, energy: 0.5 },  { name: 'main', bars: 8, energy: 0.75 },
        { name: 'peak', bars: 8, energy: 1.0 },   { name: 'outro', bars: 4, energy: 0.15 },
    ],
    [
        { name: 'build', bars: 4, energy: 0.5 },  { name: 'main', bars: 8, energy: 0.8 },
        { name: 'peak', bars: 8, energy: 1.0 },   { name: 'break', bars: 4, energy: 0.35 },
        { name: 'peak2', bars: 8, energy: 0.95 }, { name: 'outro', bars: 4, energy: 0.2 },
    ],
    [
        { name: 'intro', bars: 4, energy: 0.15 }, { name: 'build', bars: 4, energy: 0.4 },
        { name: 'main', bars: 8, energy: 0.65 },  { name: 'build2', bars: 4, energy: 0.5 },
        { name: 'main2', bars: 8, energy: 0.7 },  { name: 'outro', bars: 4, energy: 0.1 },
    ],
    [
        { name: 'intro', bars: 4, energy: 0.1 },  { name: 'build', bars: 4, energy: 0.4 },
        { name: 'build2', bars: 4, energy: 0.6 }, { name: 'main', bars: 8, energy: 0.85 },
        { name: 'peak', bars: 8, energy: 1.0 },   { name: 'peak2', bars: 8, energy: 0.95 },
    ],
]

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

function markovNext(current: Numeral): Numeral {
    const transitions = MARKOV[current]
    const totalWeight = transitions.reduce((sum, [, w]) => sum + w, 0)
    let r = rng() * totalWeight
    for (const [target, weight] of transitions) {
        r -= weight
        if (r <= 0) return target
    }
    return transitions[transitions.length - 1][0]
}

function generatePhrase(): Numeral[] {
    const walk: Numeral[] = ['Im']
    for (let i = 1; i < 4; i++) walk.push(markovNext(walk[i - 1]))
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

function energyLevel(energy: Energy): EnergyLevel {
    if (energy < 0.25) return 'low'
    if (energy < 0.55) return 'mid'
    if (energy < 0.85) return 'high'
    return 'peak'
}

// ── Arp Patterns ─────────────────────────────────────────────

type ArpStyle = 'up' | 'down' | 'updown' | 'random'
const ARP_STYLES: readonly ArpStyle[] = ['up', 'down', 'updown', 'random']

function generateArpPattern(chordNotes: string[], style: ArpStyle, energy: Energy): (string | null)[] {
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

function generateMotif(scaleNotes: string[], length: number): number[] {
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

function varyMotif(motif: number[], amount: number): number[] {
    return motif.map(d => rng() < amount ? d + rngInt(-1, 1) : d)
}

function degreeToNote(scaleNotes: string[], degree: number, octaveBase: number): string {
    const len = scaleNotes.length
    const oct = Math.floor(degree / len)
    const idx = ((degree % len) + len) % len
    return scaleNotes[idx] + (octaveBase + oct)
}

// ── Energy Curve ─────────────────────────────────────────────

function buildEnergyCurve(structure: readonly SectionDef[]): { curve: number[]; sectionNames: string[] } {
    const raw: number[] = []
    const sectionNames: string[] = []
    for (const section of structure) {
        for (let b = 0; b < section.bars; b++) {
            raw.push(section.energy)
            sectionNames.push(section.name)
        }
    }

    function smooth(arr: number[]): number[] {
        return arr.map((e, i) => {
            const prev = i > 0 ? arr[i - 1] : e
            const next = i < arr.length - 1 ? arr[i + 1] : e
            return prev * 0.15 + e * 0.7 + next * 0.15
        })
    }
    let curve = raw
    for (let pass = 0; pass < 3; pass++) curve = smooth(curve)

    // Seeded Perlin-like noise for organic feel
    const noise: number[] = []
    for (let i = 0; i <= raw.length; i++) noise.push(rng())
    curve = curve.map((e, i) => {
        const fi = Math.floor(i * 0.5)
        const frac = (i * 0.5) - fi
        const t = frac * frac * (3 - 2 * frac) // smoothstep
        const a = noise[Math.min(fi, noise.length - 1)]
        const b = noise[Math.min(fi + 1, noise.length - 1)]
        const n = (a + (b - a) * t - 0.5) * 0.1
        return Math.max(0.01, Math.min(1, e + n))
    })

    return { curve, sectionNames }
}

// ── BPM Curve ────────────────────────────────────────────────

function buildBpmCurve(structure: readonly SectionDef[]): number[] {
    const baseBpm = Math.round(BPM_CENTER + (rng() - 0.5) * BPM_RANGE)
    const bpmCurve: number[] = []
    for (const section of structure) {
        const nudge = Math.round((rng() - 0.5) * 8)
        const currentBpm = Math.max(112, Math.min(144, baseBpm + nudge))
        for (let b = 0; b < section.bars; b++) {
            bpmCurve.push(currentBpm)
        }
    }
    return bpmCurve
}

// ── Bar Timing ───────────────────────────────────────────────

function buildBarTiming(bpmCurve: number[]): { barStartTimes: number[]; barDurations: number[]; totalTime: number } {
    const barStartTimes: number[] = []
    const barDurations: number[] = []
    let t = 0
    for (let i = 0; i < bpmCurve.length; i++) {
        const beatSec = 60 / bpmCurve[i]
        const barSec = beatSec * 4
        barStartTimes.push(t)
        barDurations.push(barSec)
        t += barSec
    }
    return { barStartTimes, barDurations, totalTime: t }
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

function computeVolumes(energy: Energy, ordering: readonly InstrumentName[]): Record<InstrumentName, number> {
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

export function composeMusic(seed: Seed): MusicComposition {
    seedRng(seed)

    const tonic = pick(KEY_POOL)
    const structIdx = Math.floor(rng() * STRUCTURES.length)
    const structure = STRUCTURES[structIdx]
    const structureName = STRUCTURE_NAMES[structIdx]

    // 4-chord Markov phrase
    const phrase = generatePhrase()
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
    const baseMotif = generateMotif(scaleNotes, motifLen)
    const drumChoices: Record<EnergyLevel, number> = {
        low: rngInt(0, 2), mid: rngInt(0, 2),
        high: rngInt(0, 2), peak: rngInt(0, 2),
    }

    // Instrument ordering
    const orderIdx = Math.floor(rng() * ORDERINGS.length)
    const ordering = ORDERINGS[orderIdx]
    const orderingName = ORDERING_NAMES[orderIdx]

    // Build curves and timing
    const { curve: energyCurve, sectionNames } = buildEnergyCurve(structure)
    const totalBars = energyCurve.length
    const bpmCurve = buildBpmCurve(structure)
    const { barStartTimes, barDurations, totalTime } = buildBarTiming(bpmCurve)

    // Build bar data
    const bars: BarData[] = []
    for (let i = 0; i < totalBars; i++) {
        const phraseIdx = i % 4
        bars.push({
            bar: i,
            section: sectionNames[i],
            energy: energyCurve[i],
            bpm: bpmCurve[i],
            chordSymbol: chordSymbols[phraseIdx],
            numeral: phrase[phraseIdx],
            voiced: phraseVoicings[phraseIdx],
        })
    }

    // Melody rhythm pattern
    const melodyRhythm: boolean[] = []
    for (let i = 0; i < motifLen; i++) melodyRhythm.push(i === 0 || rng() < 0.5)

    // Pre-compute ALL events
    const padEvents: ChordEvent[] = []
    const bassEvents: NoteEvent[] = []
    const kickEvents: DrumEvent[] = []
    const snareEvents: DrumEvent[] = []
    const hatEvents: DrumEvent[] = []
    const arpEvents: NoteEvent[] = []
    const melodyEvents: NoteEvent[] = []

    let currentMotif = baseMotif
    let melodyStepCounter = 0

    for (const bar of bars) {
        const barTime = barStartTimes[bar.bar]
        const barSec = barDurations[bar.bar]
        const beatSec = barSec / 4
        const stepSec = beatSec / 2
        const energy = bar.energy
        const level = energyLevel(energy)
        const vols = computeVolumes(energy, ordering)

        const nextEnergy = bar.bar < totalBars - 1 ? energyCurve[bar.bar + 1] : energy
        const isTransition = Math.abs(nextEnergy - energy) > 0.06
        const isPhraseLast = (bar.bar + 1) % 4 === 0

        // Pad: overlapping duration for crossfade
        if (vols.pad > MIN_VEL) {
            padEvents.push({
                time: barTime,
                notes: bar.voiced,
                duration: barSec * 1.1,
                vel: vols.pad,
            })
        }

        // Bass: rhythm varies with energy
        if (vols.bass > MIN_VEL) {
            const rootNote = bar.voiced[0]
            const rootMidi = Note.midi(rootNote)
            if (rootMidi !== null) {
                const bassNote = Note.fromMidi(rootMidi - 12)

                if (energy < 0.4) {
                    bassEvents.push({ time: barTime, note: bassNote, duration: barSec * 0.9, vel: vols.bass })
                } else if (energy < 0.7) {
                    bassEvents.push({ time: barTime, note: bassNote, duration: beatSec * 1.8, vel: vols.bass })
                    bassEvents.push({ time: barTime + beatSec * 2, note: bassNote, duration: beatSec * 1.8, vel: vols.bass })
                } else {
                    const chordMidis = bar.voiced
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

        // Drums: pattern selected by energy, velocity by sigmoid
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

        // Drum fill at phrase boundary before significant energy change
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
            const arpNotes = bar.voiced
                .map(n => Note.midi(n))
                .filter((m): m is number => m !== null)
                .map(m => Note.fromMidi(m + 12))
            const pattern = generateArpPattern(arpNotes, arpStyle, energy)
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
                currentMotif = rng() < 0.3 ? baseMotif : varyMotif(baseMotif, 0.3)
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
            melodyStepCounter += 8 // keep counter advancing for determinism
        }
    }

    return {
        seed,
        tonic,
        structureName,
        orderingName,
        totalBars,
        totalTime,
        bars,
        energyCurve,
        bpmCurve,
        barStartTimes,
        barDurations,
        padEvents: dedupChord(padEvents),
        bassEvents: dedupNote(bassEvents),
        kickEvents: dedupDrum(kickEvents),
        snareEvents: dedupDrum(snareEvents),
        hatEvents: dedupDrum(hatEvents),
        arpEvents: dedupNote(arpEvents),
        melodyEvents: dedupNote(melodyEvents),
    }
}
