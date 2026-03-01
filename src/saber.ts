import { type Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math'
import { type Hand, type Teardown, type System, type Theme, handColor } from './types'
import { type Trail, createTrail } from './trail'

const HANDLE_HEIGHT = 0.25
const HANDLE_DIAMETER = 0.035
const BLADE_HEIGHT = 0.8
const BLADE_DIAMETER = 0.03

interface SaberParts {
    readonly root: TransformNode
    readonly bladeBase: TransformNode
    readonly bladeTip: TransformNode
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

    // Marker nodes for trail sampling — parented to blade mesh
    const bladeBase = new TransformNode(`${name}BladeBase`, scene)
    bladeBase.position.y = -BLADE_HEIGHT / 2
    bladeBase.parent = blade

    const bladeTip = new TransformNode(`${name}BladeTip`, scene)
    bladeTip.position.y = BLADE_HEIGHT / 2
    bladeTip.parent = blade

    return { root, bladeBase, bladeTip }
}

export function createSabers(scene: Scene, theme: Theme): Sabers {
    const sabers = new Map<Hand, SaberEntry>()

    return {
        attach(hand, grip) {
            const parts = buildSaber(scene, `${hand}Saber`, handColor(theme, hand))
            parts.root.parent = grip
            const trail = createTrail(scene, `${hand}Saber`, handColor(theme, hand))
            sabers.set(hand, { parts, trail })
        },

        detach(hand) {
            const entry = sabers.get(hand)
            if (!entry) return
            entry.trail.dispose()
            entry.parts.root.dispose(false, true)
            sabers.delete(hand)
        },

        trailUpdateSystem: () => {
            for (const entry of sabers.values()) {
                // Force world matrix recomputation to reflect XR transforms
                entry.parts.bladeTip.computeWorldMatrix(true)
                entry.parts.bladeBase.computeWorldMatrix(true)
                const tip = entry.parts.bladeTip.getAbsolutePosition()
                const base = entry.parts.bladeBase.getAbsolutePosition()
                entry.trail.sample(tip, base)
            }
        },

        dispose() {
            for (const entry of sabers.values()) {
                entry.trail.dispose()
                entry.parts.root.dispose(false, true)
            }
            sabers.clear()
        },
    }
}
