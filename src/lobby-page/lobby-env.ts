import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'
import { type Light } from '@babylonjs/core/Lights/light'
import { type Teardown } from '../types'

// ── Constants ────────────────────────────────────────────────────

const BG = new Color3(0.01, 0.01, 0.03)
const FOG_DENSITY = 0.025
const PLATFORM_RADIUS = 6
const PILLAR_COUNT = 6
const PILLAR_DISTANCE = 7
const PILLAR_HEIGHT = 7
const PILLAR_DIAMETER = 0.08
const PILLAR_GLOW = new Color3(0.15, 0.05, 0.4)
const EDGE_GLOW = new Color3(0.08, 0.04, 0.25)

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

    const hemi = new HemisphericLight('lobbyHemi', new Vector3(0, 1, 0), scene)
    hemi.intensity = 0.06
    lights.push(hemi)

    const glow = new GlowLayer('lobbyGlow', scene, {
        mainTextureSamples: 4,
        blurKernelSize: 64,
    })
    glow.intensity = 1.0
    glow.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
        if (mesh.material instanceof StandardMaterial) {
            const ec = mesh.material.emissiveColor
            result.set(ec.r, ec.g, ec.b, 1)
        } else {
            result.set(0, 0, 0, 0)
        }
    }

    // ── Platform ────────────────────────────────────────────────

    const platformMat = new StandardMaterial('lobbyPlatformMat', scene)
    platformMat.diffuseColor = new Color3(0.02, 0.02, 0.04)
    platformMat.specularColor = Color3.Black()
    materials.push(platformMat)

    const platform = MeshBuilder.CreateDisc('lobbyPlatform', {
        radius: PLATFORM_RADIUS,
        tessellation: 64,
    }, scene)
    platform.rotation.x = Math.PI / 2
    platform.material = platformMat
    platform.parent = root

    // ── Platform edge ring ──────────────────────────────────────

    const edgeMat = new StandardMaterial('lobbyEdgeMat', scene)
    edgeMat.emissiveColor = EDGE_GLOW
    edgeMat.disableLighting = true
    materials.push(edgeMat)

    const edgeRing = MeshBuilder.CreateTorus('lobbyEdge', {
        diameter: PLATFORM_RADIUS * 2,
        thickness: 0.04,
        tessellation: 64,
    }, scene)
    edgeRing.position.y = 0.01
    edgeRing.material = edgeMat
    edgeRing.parent = root

    // ── Pillars (semicircle behind player) ──────────────────────
    // Arc from left (-90°) through behind (0°) to right (+90°),
    // leaving the front clear for menu panels.

    const pillarMat = new StandardMaterial('lobbyPillarMat', scene)
    pillarMat.emissiveColor = PILLAR_GLOW
    pillarMat.disableLighting = true
    materials.push(pillarMat)

    for (let i = 0; i < PILLAR_COUNT; i++) {
        const angle = ((i / (PILLAR_COUNT - 1)) * 180 - 90) * Math.PI / 180
        const x = Math.sin(angle) * PILLAR_DISTANCE
        const z = Math.cos(angle) * PILLAR_DISTANCE

        const pillar = MeshBuilder.CreateCylinder(`lobbyPillar${i}`, {
            height: PILLAR_HEIGHT,
            diameter: PILLAR_DIAMETER,
            tessellation: 12,
        }, scene)
        pillar.position.set(x, PILLAR_HEIGHT / 2, z)
        pillar.material = pillarMat
        pillar.parent = root
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
