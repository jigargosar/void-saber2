import { type Color3 } from '@babylonjs/core/Maths/math'

// ── Domain type aliases ──────────────────────────────────────

export type Seconds = number
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
