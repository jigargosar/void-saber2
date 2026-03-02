import { type Seed, type Difficulty } from './types'

// ── Command union ─────────────────────────────────────────

export type Command =
    | { readonly type: 'navigateToArena'; readonly seed: Seed; readonly difficulty: Difficulty }
    | { readonly type: 'returnToLobby' }
    | { readonly type: 'songEnd' }

// ── Queue ─────────────────────────────────────────────────

export interface CommandQueue {
    enqueue(command: Command): void
    drain(handler: (command: Command) => void): void
}

export function createCommandQueue(): CommandQueue {
    let pending: Command[] = []

    return {
        enqueue(command) {
            pending.push(command)
        },

        drain(handler) {
            const batch = pending
            pending = []
            for (const command of batch) {
                handler(command)
            }
        },
    }
}
