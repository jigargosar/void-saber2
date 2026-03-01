import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { type Scene } from '@babylonjs/core/scene'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'
import { type Teardown } from './types'

const MAX_SAMPLES = 60
const MAX_SAMPLE_SPACING = 0.02
const MAX_TRAIL_DISTANCE = 0.5

export interface Trail {
    sample(tipWorld: Vector3, baseWorld: Vector3): void
    dispose: Teardown
}

export function createTrail(scene: Scene, name: string, color: Color3): Trail {
    const positions = new Float32Array(MAX_SAMPLES * 2 * 3)
    const colors = new Float32Array(MAX_SAMPLES * 2 * 4)

    const indices: number[] = []
    for (let i = 0; i < MAX_SAMPLES - 1; i++) {
        const tip0 = i * 2
        const base0 = i * 2 + 1
        const tip1 = (i + 1) * 2
        const base1 = (i + 1) * 2 + 1
        indices.push(tip0, tip1, base0)
        indices.push(base0, tip1, base1)
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

    // Render nothing until we have at least 2 samples
    mesh.subMeshes[0].indexCount = 0

    let sampleCount = 0
    const prevTip = new Vector3()
    const prevBase = new Vector3()

    function writeSample(tip: Vector3, base: Vector3): void {
        if (sampleCount < MAX_SAMPLES) {
            const offset = sampleCount * 6
            positions[offset] = tip.x
            positions[offset + 1] = tip.y
            positions[offset + 2] = tip.z
            positions[offset + 3] = base.x
            positions[offset + 4] = base.y
            positions[offset + 5] = base.z
            sampleCount++
        } else {
            positions.copyWithin(0, 6)
            const offset = (MAX_SAMPLES - 1) * 6
            positions[offset] = tip.x
            positions[offset + 1] = tip.y
            positions[offset + 2] = tip.z
            positions[offset + 3] = base.x
            positions[offset + 4] = base.y
            positions[offset + 5] = base.z
        }
    }

    function recomputeColors(): void {
        let cumDist = 0
        for (let i = sampleCount - 1; i >= 0; i--) {
            if (i < sampleCount - 1) {
                const curr = i * 6
                const next = (i + 1) * 6
                const dx = positions[next] - positions[curr]
                const dy = positions[next + 1] - positions[curr + 1]
                const dz = positions[next + 2] - positions[curr + 2]
                cumDist += Math.sqrt(dx * dx + dy * dy + dz * dz)
            }

            const alpha = Math.max(0, 1 - cumDist / MAX_TRAIL_DISTANCE)
            const ci = i * 8
            colors[ci] = 1; colors[ci + 1] = 1; colors[ci + 2] = 1; colors[ci + 3] = alpha
            colors[ci + 4] = 1; colors[ci + 5] = 1; colors[ci + 6] = 1; colors[ci + 7] = alpha
        }
    }

    return {
        sample(tipWorld, baseWorld) {
            // Always write current position — degenerate triangles when
            // stationary are invisible (zero area), no emit threshold needed.
            const dist = sampleCount > 0 ? Vector3.Distance(tipWorld, prevTip) : 0

            // Sub-frame interpolation for fast swings
            if (sampleCount > 0 && dist > MAX_SAMPLE_SPACING) {
                const steps = Math.ceil(dist / MAX_SAMPLE_SPACING)
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps
                    writeSample(
                        Vector3.Lerp(prevTip, tipWorld, t),
                        Vector3.Lerp(prevBase, baseWorld, t),
                    )
                }
            } else {
                writeSample(tipWorld, baseWorld)
            }

            prevTip.copyFrom(tipWorld)
            prevBase.copyFrom(baseWorld)

            // Only render quads between active samples
            mesh.subMeshes[0].indexCount = Math.max(0, (sampleCount - 1) * 6)

            recomputeColors()
            mesh.updateVerticesData(VertexBuffer.PositionKind, positions)
            mesh.updateVerticesData(VertexBuffer.ColorKind, colors)
        },

        dispose() {
            mesh.dispose(false, true)
        },
    }
}
