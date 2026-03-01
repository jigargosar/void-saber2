import { type Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math'
import { type Hand, type Teardown, type System, type Theme, handColor } from './types'
import { createTrail, type Trail } from './trail'

const HANDLE_HEIGHT = 0.25
const HANDLE_DIAMETER = 0.035
const BLADE_HEIGHT = 0.8
const BLADE_DIAMETER = 0.03

interface SaberParts {
    readonly root: TransformNode
    readonly bladeBase: TransformNode
    readonly bladeTip: TransformNode
}

interface SaberState {
    readonly root: TransformNode
    readonly bladeBase: TransformNode
    readonly bladeTip: TransformNode
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

    // Marker nodes for trail sampling (parented to root)
    const bladeBase = new TransformNode(`${name}BladeBase`, scene)
    bladeBase.position.y = HANDLE_HEIGHT / 2
    bladeBase.parent = root

    const bladeTip = new TransformNode(`${name}BladeTip`, scene)
    bladeTip.position.y = HANDLE_HEIGHT / 2 + BLADE_HEIGHT
    bladeTip.parent = root

    return { root, bladeBase, bladeTip }
}

export function createSabers(scene: Scene, theme: Theme): Sabers {
    const sabers = new Map<Hand, SaberState>()

    return {
        attach(hand, grip) {
            const { root, bladeBase, bladeTip } = buildSaber(
                scene, `${hand}Saber`, handColor(theme, hand),
            )
            root.parent = grip
            const trail = createTrail(scene, `${hand}Saber`, handColor(theme, hand))
            sabers.set(hand, { root, bladeBase, bladeTip, trail })
        },

        detach(hand) {
            const state = sabers.get(hand)
            if (!state) return
            state.trail.dispose()
            state.root.dispose(false, true)
            sabers.delete(hand)
        },

        trailUpdateSystem: () => {
            for (const { bladeBase, bladeTip, trail } of sabers.values()) {
                // Force world matrix update before reading positions
                bladeBase.computeWorldMatrix(true)
                bladeTip.computeWorldMatrix(true)
                trail.sample(
                    bladeTip.getAbsolutePosition(),
                    bladeBase.getAbsolutePosition(),
                )
            }
        },

        dispose() {
            for (const state of sabers.values()) {
                state.trail.dispose()
                state.root.dispose(false, true)
            }
            sabers.clear()
        },
    }
}
