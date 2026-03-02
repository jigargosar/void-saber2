import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { SpotLight } from '@babylonjs/core/Lights/spotLight'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'
import { type Light } from '@babylonjs/core/Lights/light'
import { type Teardown } from '../types'

// ── Scene atmosphere ─────────────────────────────────────────────

const BG = new Color3(0.02, 0.01, 0.05)          // dark purple
const FOG_DENSITY = 0.035

// ── Wireframe border ─────────────────────────────────────────────

const BORDER_W = 5                                // meters, x-axis
const BORDER_D = 4                                // meters, z-axis
const BORDER_THICKNESS = 0.02
const BORDER_HEIGHT = 0.01
const BORDER_GLOW = new Color3(0.1, 0.4, 0.5)    // teal

// ── Distant box clusters (depth cues) ────────────────────────────
// Asymmetric groups at varying distances. Fogged out.
// Imply ground plane existence without a visible floor surface.

const BOX_CLUSTERS = [
    // Front-right
    { x: 12, z: -8, w: 2, h: 3, d: 2 },
    { x: 14, z: -7, w: 1.5, h: 2, d: 1.5 },
    { x: 13, z: -9.5, w: 1, h: 1.5, d: 1 },
    // Right side
    { x: 18, z: 2, w: 2.5, h: 4, d: 2 },
    { x: 16, z: 3, w: 1.5, h: 2.5, d: 1.5 },
    // Behind-left
    { x: -10, z: 12, w: 3, h: 3.5, d: 2.5 },
    { x: -8, z: 14, w: 1.5, h: 2, d: 1.5 },
    { x: -12, z: 13, w: 2, h: 4, d: 2 },
    // Behind-right
    { x: 8, z: 15, w: 2, h: 3, d: 2.5 },
    { x: 10, z: 16, w: 1.5, h: 2, d: 1 },
    // Far left
    { x: -16, z: -3, w: 2, h: 3.5, d: 2 },
    { x: -18, z: -1, w: 1, h: 2, d: 1.5 },
] as const

// ── Public interface ─────────────────────────────────────────────

export interface LobbyEnv {
    dispose: Teardown
}

export function createLobbyEnv(scene: Scene): LobbyEnv {
    const root = new TransformNode('lobbyEnvRoot', scene)
    const materials: StandardMaterial[] = []
    const lights: Light[] = []

    // ── Atmosphere ───────────────────────────────────────────────

    scene.clearColor = new Color4(BG.r, BG.g, BG.b, 1)
    scene.fogMode = Scene.FOGMODE_EXP2
    scene.fogDensity = FOG_DENSITY
    scene.fogColor = BG

    // ── Lighting ────────────────────────────────────────────────

    // Dim purple ambient — just enough to faintly see box silhouettes
    const hemi = new HemisphericLight('lobbyHemi', new Vector3(0, 1, 0), scene)
    hemi.intensity = 0.02
    hemi.diffuse = new Color3(0.2, 0.1, 0.4)
    lights.push(hemi)

    // Blue/teal spotlight from above menu area, pointing down
    const spot = new SpotLight(
        'lobbySpot',
        new Vector3(0, 12, -1),                       // above/behind menu panels
        new Vector3(0, -1, -0.2).normalize(),         // down, slightly forward
        Math.PI / 3,                                  // 60° cone
        2,                                            // falloff exponent
        scene,
    )
    spot.diffuse = new Color3(0.2, 0.6, 0.8)         // blue/teal
    spot.intensity = 3
    lights.push(spot)

    // Glow layer for wireframe border and UI emissives
    const glow = new GlowLayer('lobbyGlow', scene, {
        mainTextureSamples: 4,
        blurKernelSize: 64,
    })
    glow.intensity = 1.2
    glow.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
        if (mesh.material instanceof StandardMaterial) {
            const ec = mesh.material.emissiveColor
            result.set(ec.r, ec.g, ec.b, 1)
        } else {
            result.set(0, 0, 0, 0)
        }
    }

    // ── Wireframe border (4 emissive edges, no floor surface) ───

    const borderMat = new StandardMaterial('lobbyBorderMat', scene)
    borderMat.emissiveColor = BORDER_GLOW
    borderMat.disableLighting = true
    materials.push(borderMat)

    const halfW = BORDER_W / 2
    const halfD = BORDER_D / 2
    const borderEdges = [
        { w: BORDER_W, d: BORDER_THICKNESS, x: 0, z: -halfD },  // front
        { w: BORDER_W, d: BORDER_THICKNESS, x: 0, z: halfD },   // back
        { w: BORDER_THICKNESS, d: BORDER_D, x: -halfW, z: 0 },  // left
        { w: BORDER_THICKNESS, d: BORDER_D, x: halfW, z: 0 },   // right
    ]

    for (let i = 0; i < borderEdges.length; i++) {
        const e = borderEdges[i]
        const edge = MeshBuilder.CreateBox(`lobbyEdge${i}`, {
            width: e.w, height: BORDER_HEIGHT, depth: e.d,
        }, scene)
        edge.position.set(e.x, BORDER_HEIGHT / 2, e.z)
        edge.material = borderMat
        edge.parent = root
    }

    // ── Box clusters (depth cues) ───────────────────────────────

    const boxMat = new StandardMaterial('lobbyBoxMat', scene)
    boxMat.diffuseColor = new Color3(0.03, 0.03, 0.05)
    boxMat.specularColor = Color3.Black()
    materials.push(boxMat)

    for (let i = 0; i < BOX_CLUSTERS.length; i++) {
        const b = BOX_CLUSTERS[i]
        const box = MeshBuilder.CreateBox(`lobbyBox${i}`, {
            width: b.w, height: b.h, depth: b.d,
        }, scene)
        box.position.set(b.x, b.h / 2, b.z)
        box.material = boxMat
        box.parent = root
    }

    // ── Handle ──────────────────────────────────────────────────

    return {
        dispose() {
            glow.dispose()
            for (const light of lights) light.dispose()
            for (const mat of materials) mat.dispose()
            root.dispose(false, true)
            scene.fogMode = Scene.FOGMODE_NONE
            scene.clearColor = new Color4(0, 0, 0, 1)
        },
    }
}
