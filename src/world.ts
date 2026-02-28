import { createWorld, trait } from 'koota'
import { type Color3 } from '@babylonjs/core/Maths/math'

// ── Koota world ─────────────────────────────────────────────

export const world = createWorld()

// ── Traits ──────────────────────────────────────────────────

export const BeatPulse = trait(() => ({ intensity: 0 }))

// ── Theme ───────────────────────────────────────────────────

export type Hand = 'left' | 'right'

export interface Theme {
    readonly leftHand: Color3
    readonly rightHand: Color3
}

export function handColor(theme: Theme, hand: Hand): Color3 {
    return hand === 'left' ? theme.leftHand : theme.rightHand
}
