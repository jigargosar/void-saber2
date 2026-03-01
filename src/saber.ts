import { type Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { type Mesh } from '@babylonjs/core/Meshes/mesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3, Vector3 } from '@babylonjs/core/Maths/math'
import { type Hand, type Teardown, type System, type Theme, handColor } from './types'
import { type Trail, createTrail } from './trail'

const HANDLE_HEIGHT = 0.25
const HANDLE_DIAMETER = 0.035
const BLADE_HEIGHT = 0.8
const BLADE_DIAMETER = 0.03

// Local-space blade endpoints for trail sampling (no marker nodes needed)
const BLADE_TIP_LOCAL = new Vector3(0, BLADE_HEIGHT / 2, 0)
const BLADE_BASE_LOCAL = new Vector3(0, -BLADE_HEIGHT / 2, 0)

interface SaberParts {
    readonly root: TransformNode
    readonly blade: Mesh
}

interface SaberEntry {
    readonly parts: SaberParts
    readonly trail: Trail
}

export interface Sabers {
    attach(hand: Hand, grip: TransformNode): void
    detach(hand: Hand): void
    readonly trailUpdateSystem: System
    dispose: Teardown
}

function buildSaber(scene: Scene, name: string, color: Color3): SaberParts {
    const root = new TransformNode(`${name}Root`, scene)
    root.rotation.x = Math.PI / 2

    const handleMat = new StandardMaterial(`${name}HandleMat`, scene)
    handleMat.diffuseColor = new Color3(0.15, 0.15, 0.18)
    handleMat.specularColor = new Color3(0.3, 0.3, 0.3)

    const handle = MeshBuilder.CreateCylinder(`${name}Handle`, {
        height: HANDLE_HEIGHT,
        diameter: HANDLE_DIAMETER,
        tessellation: 12,
    }, scene)
    handle.material = handleMat
    handle.parent = root

    const bladeMat = new StandardMaterial(`${name}BladeMat`, scene)
    bladeMat.emissiveColor = color
    bladeMat.disableLighting = true

    const blade = MeshBuilder.CreateCylinder(`${name}Blade`, {
        height: BLADE_HEIGHT,
        diameter: BLADE_DIAMETER,
        tessellation: 8,
    }, scene)
    blade.material = bladeMat
    blade.position.y = HANDLE_HEIGHT / 2 + BLADE_HEIGHT / 2
    blade.parent = root

    return { root, blade }
}

export function createSabers(scene: Scene, theme: Theme): Sabers {
    const sabers = new Map<Hand, SaberEntry>()

    // Pre-allocated scratch vectors for world-space blade endpoints
    const tipWorld = new Vector3()
    const baseWorld = new Vector3()

    return {
        attach(hand, grip) {
            const color = handColor(theme, hand)
            const parts = buildSaber(scene, `${hand}Saber`, color)
            parts.root.parent = grip
            const trail = createTrail(scene, `${hand}Trail`, color)
            sabers.set(hand, { parts, trail })
        },

        detach(hand) {
            const entry = sabers.get(hand)
            if (!entry) return
            entry.trail.dispose()
            entry.parts.root.dispose(false, true)
            sabers.delete(hand)
        },

        trailUpdateSystem: (dt) => {
            for (const { parts, trail } of sabers.values()) {
                parts.blade.computeWorldMatrix(true)
                const worldMatrix = parts.blade.getWorldMatrix()
                Vector3.TransformCoordinatesToRef(BLADE_TIP_LOCAL, worldMatrix, tipWorld)
                Vector3.TransformCoordinatesToRef(BLADE_BASE_LOCAL, worldMatrix, baseWorld)
                trail.sample(tipWorld, baseWorld, dt)
            }
        },

        dispose() {
            for (const { parts, trail } of sabers.values()) {
                trail.dispose()
                parts.root.dispose(false, true)
            }
            sabers.clear()
        },
    }
}
