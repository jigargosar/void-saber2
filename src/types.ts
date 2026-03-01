import { type Color3 } from '@babylonjs/core/Maths/math'

// ── Domain type aliases ──────────────────────────────────────

export type Seconds = number
export type Velocity = number    // 0–1
export type NoteName = string    // e.g. 'C2', 'E3'
export type Hand = 'left' | 'right'
export type System = (dt: Seconds) => void
export type Teardown = () => void

// ── Theme ────────────────────────────────────────────────────

export interface Theme {
    readonly leftHand: Color3
    readonly rightHand: Color3
}

export function handColor(theme: Theme, hand: Hand): Color3 {
    switch (hand) {
        case 'left': return theme.leftHand
        case 'right': return theme.rightHand
    }
}

export function isHand(handedness: string): handedness is Hand {
    return handedness === 'left' || handedness === 'right'
}
