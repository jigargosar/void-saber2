import { type Seed, type Seconds, type BPM, type Energy } from '../types'

// ── Types ────────────────────────────────────────────────────

export interface StepInfo {
    readonly time: Seconds
    readonly barIndex: number
    readonly energy: Energy
    readonly bpm: BPM
}

export interface RhythmGrid {
    readonly seed: Seed
    readonly steps: readonly StepInfo[]
    readonly totalBars: number
    readonly totalTime: Seconds
    readonly structureName: string
    readonly sectionNames: readonly string[]
    readonly barStartTimes: readonly Seconds[]
    readonly barDurations: readonly Seconds[]
    readonly energyCurve: readonly Energy[]
    readonly bpmCurve: readonly BPM[]
}

// ── Section definitions ──────────────────────────────────────

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

// ── Seeded RNG ───────────────────────────────────────────────

const BPM_CENTER = 128
const BPM_RANGE = 12
const STEPS_PER_BAR = 8

function createRng(seed: number) {
    let s = seed
    function rng(): number {
        s = (s * 16807) % 2147483647
        return (s - 1) / 2147483646
    }
    return rng
}

// ── Energy curve ─────────────────────────────────────────────

function buildEnergyCurve(structure: readonly SectionDef[], rng: () => number): Energy[] {
    const raw: Energy[] = []
    for (const section of structure) {
        for (let b = 0; b < section.bars; b++) {
            raw.push(section.energy)
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

    const noise: number[] = []
    for (let i = 0; i <= raw.length; i++) noise.push(rng())
    curve = curve.map((e, i) => {
        const fi = Math.floor(i * 0.5)
        const frac = (i * 0.5) - fi
        const t = frac * frac * (3 - 2 * frac)
        const a = noise[Math.min(fi, noise.length - 1)]
        const b = noise[Math.min(fi + 1, noise.length - 1)]
        const n = (a + (b - a) * t - 0.5) * 0.1
        return Math.max(0.01, Math.min(1, e + n))
    })

    return curve
}

// ── BPM curve ────────────────────────────────────────────────

function buildBpmCurve(structure: readonly SectionDef[], rng: () => number): BPM[] {
    const baseBpm = Math.round(BPM_CENTER + (rng() - 0.5) * BPM_RANGE)
    const bpmCurve: BPM[] = []
    for (const section of structure) {
        const nudge = Math.round((rng() - 0.5) * 8)
        const currentBpm = Math.max(112, Math.min(144, baseBpm + nudge))
        for (let b = 0; b < section.bars; b++) {
            bpmCurve.push(currentBpm)
        }
    }
    return bpmCurve
}

// ── Bar timing ───────────────────────────────────────────────

function buildBarTiming(bpmCurve: BPM[]): { barStartTimes: Seconds[]; barDurations: Seconds[]; totalTime: Seconds } {
    const barStartTimes: Seconds[] = []
    const barDurations: Seconds[] = []
    let t: Seconds = 0
    for (let i = 0; i < bpmCurve.length; i++) {
        const beatSec = 60 / bpmCurve[i]
        const barSec = beatSec * 4
        barStartTimes.push(t)
        barDurations.push(barSec)
        t += barSec
    }
    return { barStartTimes, barDurations, totalTime: t }
}

// ── Section names per bar ────────────────────────────────────

function buildSectionNames(structure: readonly SectionDef[]): string[] {
    const names: string[] = []
    for (const section of structure) {
        for (let b = 0; b < section.bars; b++) {
            names.push(section.name)
        }
    }
    return names
}

// ── Main ─────────────────────────────────────────────────────

export function createRhythmGrid(seed: Seed): RhythmGrid {
    const rng = createRng(seed)

    const structIdx = Math.floor(rng() * STRUCTURES.length)
    const structure = STRUCTURES[structIdx]
    const structureName = STRUCTURE_NAMES[structIdx]

    const sectionNames = buildSectionNames(structure)
    const energyCurve = buildEnergyCurve(structure, rng)
    const totalBars = energyCurve.length
    const bpmCurve = buildBpmCurve(structure, rng)
    const { barStartTimes, barDurations, totalTime } = buildBarTiming(bpmCurve)

    const steps: StepInfo[] = []
    for (let bar = 0; bar < totalBars; bar++) {
        const barStart = barStartTimes[bar]
        const stepSec = barDurations[bar] / STEPS_PER_BAR
        for (let step = 0; step < STEPS_PER_BAR; step++) {
            steps.push({
                time: barStart + step * stepSec,
                barIndex: bar,
                energy: energyCurve[bar],
                bpm: bpmCurve[bar],
            })
        }
    }

    return {
        seed,
        steps,
        totalBars,
        totalTime,
        structureName,
        sectionNames,
        barStartTimes,
        barDurations,
        energyCurve,
        bpmCurve,
    }
}
