import { type Seconds } from '../types'

// ── Arena event types ────────────────────────────────────────

export type ArenaEvent =
    | { readonly type: 'beat' }
    | { readonly type: 'songEnd' }

// ── Arena event queue ────────────────────────────────────────

export interface ArenaEventQueue {
    emit(event: ArenaEvent): void
    drain(handler: (event: ArenaEvent) => void): void
}

export function createArenaEventQueue(): ArenaEventQueue {
    let pending: ArenaEvent[] = []

    return {
        emit(event) {
            pending.push(event)
        },

        drain(handler) {
            const batch = pending
            pending = []
            for (const event of batch) {
                handler(event)
            }
        },
    }
}

// ── Beat schedule system ─────────────────────────────────────
// Checks music clock against kick event times and emits beat events.

export interface BeatSchedule {
    readonly system: (dt: Seconds) => void
}

export function createBeatSchedule(
    kickTimes: readonly Seconds[],
    getCurrentTime: () => Seconds,
    arenaQueue: ArenaEventQueue,
): BeatSchedule {
    let nextKickIndex = 0

    const system = () => {
        const songTime = getCurrentTime()
        while (nextKickIndex < kickTimes.length && songTime >= kickTimes[nextKickIndex]) {
            arenaQueue.emit({ type: 'beat' })
            nextKickIndex++
        }
    }

    return { system }
}

// ── Song end detection system ────────────────────────────────

const TAIL_SECONDS: Seconds = 1.5

export interface SongEndDetector {
    readonly system: (dt: Seconds) => void
}

export function createSongEndDetector(
    totalTime: Seconds,
    getCurrentTime: () => Seconds,
    arenaQueue: ArenaEventQueue,
): SongEndDetector {
    let fired = false
    const endTime = totalTime + TAIL_SECONDS

    const system = () => {
        if (fired) return
        if (getCurrentTime() >= endTime) {
            fired = true
            arenaQueue.emit({ type: 'songEnd' })
        }
    }

    return { system }
}
