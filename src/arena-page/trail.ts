import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { type Scene } from '@babylonjs/core/scene'
import { type Color3 } from '@babylonjs/core/Maths/math'
import { type Vector3 } from '@babylonjs/core/Maths/math.vector'
import { type Seconds, type Teardown } from '../types'

const SAMPLE_COUNT = 60
const FLOATS_PER_SAMPLE = 6      // 2 vertices × 3 (base xyz, tip xyz)
const COLORS_PER_SAMPLE = 8      // 2 vertices × 4 (rgba, rgba)

const MAX_OPACITY = 0.15          // cap on sample opacity — trail stays translucent
const VELOCITY_CAP = 0.08         // distance/frame at which velocity normalizes to 1
const EMIT_SPACING_MIN = 0.005    // emit threshold at max velocity (frequent)
const EMIT_SPACING_MAX = 0.01     // emit threshold at zero velocity (rare)
const INCREMENT_SCALE = 0.1       // opacity added per emit at max velocity
const BASE_OPACITY = 0.08         // minimum opacity for any emitted sample
const MAX_TRAIL_LENGTH = 0.9      // distance at which trail fully fades (meters)
const DECAY_SCALE = 3.0           // opacity lost per second at max velocity
const MIN_DECAY = 0.1             // minimum decay so trail doesn't freeze at zero velocity

const LIVE = SAMPLE_COUNT - 1     // invisible leading-edge sample index

export interface Trail {
    sample(tipWorld: Vector3, baseWorld: Vector3, dt: Seconds): void
    dispose: Teardown
}

export function createTrail(scene: Scene, name: string, color: Color3): Trail {
    const positions = new Float32Array(SAMPLE_COUNT * FLOATS_PER_SAMPLE)
    const colors = new Float32Array(SAMPLE_COUNT * COLORS_PER_SAMPLE)
    const opacities = new Float32Array(SAMPLE_COUNT)

    // Static indices — invisible quads cost almost nothing
    const indices: number[] = []
    for (let i = 0; i < SAMPLE_COUNT - 1; i++) {
        const b0 = i * 2
        const t0 = i * 2 + 1
        const b1 = (i + 1) * 2
        const t1 = (i + 1) * 2 + 1
        indices.push(b0, t0, t1, b0, t1, b1)
    }

    const mesh = new Mesh(`${name}Trail`, scene)
    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.colors = colors
    vertexData.indices = indices
    vertexData.applyToMesh(mesh, true)

    mesh.hasVertexAlpha = true
    mesh.alwaysSelectAsActiveMesh = true

    const mat = new StandardMaterial(`${name}TrailMat`, scene)
    mat.emissiveColor = color
    mat.disableLighting = true
    mat.backFaceCulling = false
    mesh.material = mat

    // Init RGB white, alpha 0
    for (let i = 0; i < SAMPLE_COUNT * 2; i++) {
        const ci = i * 4
        colors[ci] = 1; colors[ci + 1] = 1; colors[ci + 2] = 1; colors[ci + 3] = 0
    }

    let started = false
    let prevOpacity = 0  // tracks most recent emitted sample's opacity (decays with time)

    return {
        sample(tipWorld, baseWorld, dt) {
            if (!started) {
                // Fill all with current position, zero opacity — invisible
                for (let i = 0; i < SAMPLE_COUNT; i++) {
                    const off = i * FLOATS_PER_SAMPLE
                    positions[off]     = baseWorld.x
                    positions[off + 1] = baseWorld.y
                    positions[off + 2] = baseWorld.z
                    positions[off + 3] = tipWorld.x
                    positions[off + 4] = tipWorld.y
                    positions[off + 5] = tipWorld.z
                }
                started = true
            }

            // Distance moved since last frame (from live sample position)
            const liveOff = LIVE * FLOATS_PER_SAMPLE
            const dx = tipWorld.x - positions[liveOff + 3]
            const dy = tipWorld.y - positions[liveOff + 4]
            const dz = tipWorld.z - positions[liveOff + 5]
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

            // Normalized velocity 0–1
            const velocity = Math.min(1, dist / VELOCITY_CAP)

            // Velocity-driven emit spacing: fast = frequent, slow = rare
            const emitSpacing = EMIT_SPACING_MAX - velocity * (EMIT_SPACING_MAX - EMIT_SPACING_MIN)

            if (dist > emitSpacing) {
                // Shift buffer left — oldest sample falls off
                positions.copyWithin(0, FLOATS_PER_SAMPLE)
                opacities.copyWithin(0, 1)

                // New sample at LIVE-1: base visibility + velocity-scaled increment
                const increment = BASE_OPACITY + velocity * INCREMENT_SCALE
                prevOpacity = Math.min(MAX_OPACITY, prevOpacity + increment)
                opacities[LIVE - 1] = prevOpacity
            }

            // Live sample always tracks blade — invisible stretching leading edge
            positions[liveOff]     = baseWorld.x
            positions[liveOff + 1] = baseWorld.y
            positions[liveOff + 2] = baseWorld.z
            positions[liveOff + 3] = tipWorld.x
            positions[liveOff + 4] = tipWorld.y
            positions[liveOff + 5] = tipWorld.z
            opacities[LIVE] = 0

            // Decay all samples — slow movement fades fast, fast movement lingers
            const decay = Math.max(MIN_DECAY, (1 - velocity) * DECAY_SCALE) * dt
            for (let i = 0; i < LIVE; i++) {
                opacities[i] = Math.max(0, opacities[i] - decay)
            }
            // prevOpacity also decays so new swings start dim
            prevOpacity = Math.max(0, prevOpacity - decay)

            // Distance-based fade — opacity scales down with distance from blade
            let cumDist = 0
            for (let i = LIVE - 1; i >= 0; i--) {
                if (i < LIVE - 1) {
                    const curr = i * FLOATS_PER_SAMPLE + 3
                    const next = (i + 1) * FLOATS_PER_SAMPLE + 3
                    const ex = positions[next] - positions[curr]
                    const ey = positions[next + 1] - positions[curr + 1]
                    const ez = positions[next + 2] - positions[curr + 2]
                    cumDist += Math.sqrt(ex * ex + ey * ey + ez * ez)
                }
                const distanceFade = Math.max(0, 1 - cumDist / MAX_TRAIL_LENGTH)
                opacities[i] *= distanceFade
            }

            // Write vertex colors from opacities
            for (let i = 0; i < SAMPLE_COUNT; i++) {
                const ci = i * COLORS_PER_SAMPLE
                colors[ci + 3] = opacities[i]         // base vertex alpha
                colors[ci + 4 + 3] = opacities[i]     // tip vertex alpha
            }

            mesh.updateVerticesData(VertexBuffer.PositionKind, positions)
            mesh.updateVerticesData(VertexBuffer.ColorKind, colors)
        },

        dispose() {
            mesh.dispose(false, true)
        },
    }
}
