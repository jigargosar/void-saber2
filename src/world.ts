import { createWorld, trait } from 'koota'
import { type Color3 } from '@babylonjs/core/Maths/math'
import { type StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { type GlowLayer } from '@babylonjs/core/Layers/glowLayer'

// ── Koota world ─────────────────────────────────────────────

export const world = createWorld()

// ── Types ───────────────────────────────────────────────────

export type Hand = 'left' | 'right'

export interface Theme {
    readonly leftHand: Color3
    readonly rightHand: Color3
}

export function handColor(theme: Theme, hand: Hand): Color3 {
    return hand === 'left' ? theme.leftHand : theme.rightHand
}

export interface PillarPulseTarget {
    readonly mat: StandardMaterial
    readonly baseColor: Color3
}

export type System = (dt: number) => void

// ── Traits ──────────────────────────────────────────────────

export const BeatPulse = trait(() => ({ intensity: 0 }))

export const BeatVisuals = trait((): {
    fogBaseDensity: number
    pillarTargets: PillarPulseTarget[]
    glow: GlowLayer | null
} => ({
    fogBaseDensity: 0,
    pillarTargets: [],
    glow: null,
}))

