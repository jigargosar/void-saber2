import { type Scene } from '@babylonjs/core/scene'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3, Vector3 } from '@babylonjs/core/Maths/math'
import { type Teardown } from './types'

const MAX_SAMPLES = 64
const MAX_TRAIL_DISTANCE = 1.2
const MIN_SAMPLE_DIST = 0.01
const MAX_SAMPLE_SPACING = 0.05

const VERTS_PER_SAMPLE = 2
const TOTAL_VERTS = MAX_SAMPLES * VERTS_PER_SAMPLE
const POS_FLOATS = TOTAL_VERTS * 3
const SAMPLE_POS_STRIDE = VERTS_PER_SAMPLE * 3 // 6 floats per sample (tip xyz + base xyz)

export interface Trail {
    sample(tipWorld: Vector3, baseWorld: Vector3): void
    dispose: Teardown
}

export function createTrail(scene: Scene, name: string, color: Color3): Trail {
    const positions = new Float32Array(POS_FLOATS)
    const colors = new Float32Array(TOTAL_VERTS * 4)

    // Pre-compute indices (never change)
    const indices: number[] = []
    for (let i = 0; i < MAX_SAMPLES - 1; i++) {
        const ti = i * 2
        const bi = i * 2 + 1
        const ti1 = (i + 1) * 2
        const bi1 = (i + 1) * 2 + 1
        indices.push(ti, bi, ti1, bi, bi1, ti1)
    }

    // Create mesh with updatable buffers
    const mesh = new Mesh(`${name}Trail`, scene)
    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.indices = indices
    vertexData.colors = colors
    vertexData.applyToMesh(mesh, true)
    mesh.alwaysSelectAsActiveMesh = true

    // Emissive-only material with vertex alpha
    const mat = new StandardMaterial(`${name}TrailMat`, scene)
    mat.emissiveColor = color
    mat.disableLighting = true
    mat.backFaceCulling = false
    mesh.material = mat
    mesh.hasVertexAlpha = true

    // Trail state
    let initialized = false
    const prevTip = new Vector3()
    const prevBase = new Vector3()
    const lerpTip = new Vector3()
    const lerpBase = new Vector3()

    function writeSample(tip: Vector3, base: Vector3): void {
        // Shift existing data right by one sample
        positions.copyWithin(SAMPLE_POS_STRIDE, 0, POS_FLOATS - SAMPLE_POS_STRIDE)
        // Write new sample at front (tip then base)
        positions[0] = tip.x
        positions[1] = tip.y
        positions[2] = tip.z
        positions[3] = base.x
        positions[4] = base.y
        positions[5] = base.z
    }

    function recomputeAlpha(): void {
        let cumDist = 0
        for (let i = 0; i < MAX_SAMPLES; i++) {
            if (i > 0) {
                // Distance between consecutive tip positions
                const curr = i * SAMPLE_POS_STRIDE
                const prev = (i - 1) * SAMPLE_POS_STRIDE
                const dx = positions[curr] - positions[prev]
                const dy = positions[curr + 1] - positions[prev + 1]
                const dz = positions[curr + 2] - positions[prev + 2]
                cumDist += Math.sqrt(dx * dx + dy * dy + dz * dz)
            }

            const alpha = Math.max(0, 1 - cumDist / MAX_TRAIL_DISTANCE)

            // White vertex color with distance-based alpha (tip + base)
            const tipC = i * 8
            const baseC = i * 8 + 4
            colors[tipC] = 1; colors[tipC + 1] = 1; colors[tipC + 2] = 1; colors[tipC + 3] = alpha
            colors[baseC] = 1; colors[baseC + 1] = 1; colors[baseC + 2] = 1; colors[baseC + 3] = alpha
        }
    }

    function updateMesh(): void {
        mesh.updateVerticesData(VertexBuffer.PositionKind, positions)
        mesh.updateVerticesData(VertexBuffer.ColorKind, colors)
    }

    return {
        sample(tipWorld, baseWorld) {
            if (!initialized) {
                // Fill entire buffer with starting position to avoid origin-streak
                for (let i = 0; i < MAX_SAMPLES; i++) {
                    const pi = i * SAMPLE_POS_STRIDE
                    positions[pi] = tipWorld.x
                    positions[pi + 1] = tipWorld.y
                    positions[pi + 2] = tipWorld.z
                    positions[pi + 3] = baseWorld.x
                    positions[pi + 4] = baseWorld.y
                    positions[pi + 5] = baseWorld.z
                }
                prevTip.copyFrom(tipWorld)
                prevBase.copyFrom(baseWorld)
                initialized = true
                recomputeAlpha()
                updateMesh()
                return
            }

            const dx = tipWorld.x - prevTip.x
            const dy = tipWorld.y - prevTip.y
            const dz = tipWorld.z - prevTip.z
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

            // Emit threshold: skip when blade barely moved
            if (dist < MIN_SAMPLE_DIST) return

            // Sub-frame interpolation for fast swings
            const steps = Math.max(1, Math.ceil(dist / MAX_SAMPLE_SPACING))
            for (let i = 1; i <= steps; i++) {
                const t = i / steps
                Vector3.LerpToRef(prevTip, tipWorld, t, lerpTip)
                Vector3.LerpToRef(prevBase, baseWorld, t, lerpBase)
                writeSample(lerpTip, lerpBase)
            }

            prevTip.copyFrom(tipWorld)
            prevBase.copyFrom(baseWorld)
            recomputeAlpha()
            updateMesh()
        },

        dispose() {
            mesh.dispose(false, true)
        },
    }
}
