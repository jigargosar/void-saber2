import { type Seed, type Seconds, type Hand, type Difficulty } from '../types'
import { type MusicComposition } from '../music/music-composer'
import { type BeatTimeline } from '../music/beat-timeline'

// ── Types ────────────────────────────────────────────────────

export type Lane = 0 | 1 | 2 | 3
export type Row = 0 | 1 | 2
export type SwingDirection =
    | 'up' | 'down' | 'left' | 'right'
    | 'upleft' | 'upright' | 'downleft' | 'downright'
    | 'any'

export interface Cue {
    readonly beatTime: Seconds
    readonly lane: Lane
    readonly row: Row
    readonly hand: Hand
    readonly swingDirection: SwingDirection
}

export interface Choreography {
    readonly cues: readonly Cue[]
}

export interface ChoreographyConfig {
    readonly difficulty: Difficulty
    readonly startOffset: Seconds
    readonly endOffset: Seconds
}

// ── Seeded RNG (local instance, no shared state) ─────────────

function createLocalRng(seed: Seed) {
    let s = seed
    function rng(): number {
        s = (s * 16807) % 2147483647
        return (s - 1) / 2147483646
    }
    function pick<T>(arr: readonly T[]): T {
        return arr[Math.floor(rng() * arr.length)]
    }
    return { rng, pick }
}

// ── Helpers ──────────────────────────────────────────────────

const LANES_LEFT: readonly Lane[] = [0, 1]
const LANES_RIGHT: readonly Lane[] = [2, 3]
const ALL_ROWS: readonly Row[] = [0, 1, 2]

const DENSITY_BY_DIFFICULTY: Record<Difficulty, number> = {
    easy: 0.20,
    normal: 0.40,
    hard: 0.60,
    expert: 0.80,
    expertPlus: 0.95,
}
const MAX_CONSECUTIVE_SAME_HAND = 3

function findBarIndex(beatTime: Seconds, barStartTimes: readonly Seconds[]): number {
    for (let i = barStartTimes.length - 1; i >= 0; i--) {
        if (beatTime >= barStartTimes[i]) return i
    }
    return 0
}

// ── Main ─────────────────────────────────────────────────────

export function createChoreography(
    composition: MusicComposition,
    beatTimeline: BeatTimeline,
    config: ChoreographyConfig,
): Choreography {
    const { rng, pick } = createLocalRng(composition.seed)
    const density = DENSITY_BY_DIFFICULTY[config.difficulty]
    const cues: Cue[] = []

    let lastHand: Hand = 'right'
    let consecutiveSameHand = 0

    const lastCueTime = composition.totalTime - config.endOffset

    for (const beatTime of beatTimeline.beatTimes) {
        if (beatTime < config.startOffset) continue
        if (beatTime > lastCueTime) break
        const barIndex = findBarIndex(beatTime, composition.barStartTimes)
        const energy = composition.energyCurve[barIndex]

        if (rng() > density * (0.5 + energy * 0.5)) continue

        // Hand: alternate, cap consecutive same-hand
        let hand: Hand = lastHand === 'left' ? 'right' : 'left'
        if (consecutiveSameHand < MAX_CONSECUTIVE_SAME_HAND && rng() < 0.2) {
            hand = lastHand
        }

        if (hand === lastHand) {
            consecutiveSameHand++
        } else {
            consecutiveSameHand = 1
        }
        lastHand = hand

        // Lane: biased by hand (70% same side, 30% crossover)
        const lane = rng() < 0.7
            ? pick(hand === 'left' ? LANES_LEFT : LANES_RIGHT)
            : pick(hand === 'left' ? LANES_RIGHT : LANES_LEFT)

        const row = pick(ALL_ROWS)

        // Direction: 'any' for now (collision doesn't check direction yet)
        const swingDirection: SwingDirection = 'any'

        cues.push({ beatTime, lane, row, hand, swingDirection })
    }

    return { cues }
}
