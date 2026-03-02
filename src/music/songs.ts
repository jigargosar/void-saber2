import { type Seed } from '../types'

// ── Song type ─────────────────────────────────────────────

export interface Song {
    readonly seed: Seed
    readonly name: string
}

// ── Catalog ───────────────────────────────────────────────

export const SONGS: readonly Song[] = [
    { seed: 42 as Seed, name: 'Neon Pulse' },
    { seed: 1337 as Seed, name: 'Dark Matter' },
    { seed: 7890 as Seed, name: 'Cyber Storm' },
    { seed: 25000 as Seed, name: 'Void Walker' },
    { seed: 55555 as Seed, name: 'Neural Drift' },
    { seed: 99999 as Seed, name: 'Shadow Circuit' },
    { seed: 12345 as Seed, name: 'Ambient Flow' },
    { seed: 67890 as Seed, name: 'Slow Burn' },
    { seed: 31415 as Seed, name: 'Deep Fade' },
]
