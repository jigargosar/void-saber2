import { type Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'
import { type System, type Seconds, type Teardown } from './types'

const BG = new Color4(0.01, 0.01, 0.03, 1)
const CYAN = new Color3(0, 0.9, 0.95)
const MAGENTA = new Color3(0.95, 0, 0.7)
const PURPLE = new Color3(0.4, 0, 0.6)

// Saber geometry
const HANDLE_HEIGHT = 0.25
const HANDLE_DIAMETER = 0.035
const BLADE_HEIGHT = 0.8
const BLADE_DIAMETER = 0.03

// Layout — sabers float in front of camera
const SABER_Y = 1.3
const SABER_Z = -3
const SABER_SPREAD = 0.6
const SABER_TILT = 0.3     // radians, crossed inward
const BOB_AMPLITUDE = 0.06
const BOB_SPEED = 0.8       // cycles per second
const ROTATE_SPEED = 0.15   // radians per second (slow drift)

// Floating pillar ring
const RING_PILLAR_COUNT = 8
const RING_RADIUS = 4
const RING_Y = 1.3
const RING_ROTATE_SPEED = 0.12

// Glow pulse
const GLOW_BASE = 0.8
const GLOW_AMPLITUDE = 0.4
const GLOW_SPEED = 1.2

export interface SplashPage {
    readonly systems: readonly System[]
    dispose: Teardown
}

export function createSplashPage(scene: Scene): SplashPage {
    scene.clearColor = BG
    scene.fogMode = 0 // FOGMODE_NONE

    const root = new TransformNode('splashRoot', scene)
    const materials: StandardMaterial[] = []

    // ── Glow layer ────────────────────────────────────────────

    const glow = new GlowLayer('splashGlow', scene, {
        mainTextureSamples: 4,
        blurKernelSize: 64,
    })
    glow.intensity = GLOW_BASE

    // ── Two floating sabers ───────────────────────────────────

    function buildSaber(name: string, color: Color3, x: number, tiltZ: number): TransformNode {
        const saberRoot = new TransformNode(name, scene)
        saberRoot.position.set(x, SABER_Y, SABER_Z)
        saberRoot.rotation.x = Math.PI / 2
        saberRoot.rotation.z = tiltZ
        saberRoot.parent = root

        const handleMat = new StandardMaterial(`${name}HandleMat`, scene)
        handleMat.diffuseColor = new Color3(0.15, 0.15, 0.18)
        handleMat.specularColor = new Color3(0.3, 0.3, 0.3)
        materials.push(handleMat)

        const handle = MeshBuilder.CreateCylinder(`${name}Handle`, {
            height: HANDLE_HEIGHT,
            diameter: HANDLE_DIAMETER,
            tessellation: 12,
        }, scene)
        handle.material = handleMat
        handle.parent = saberRoot

        const bladeMat = new StandardMaterial(`${name}BladeMat`, scene)
        bladeMat.emissiveColor = color
        bladeMat.disableLighting = true
        materials.push(bladeMat)

        const blade = MeshBuilder.CreateCylinder(`${name}Blade`, {
            height: BLADE_HEIGHT,
            diameter: BLADE_DIAMETER,
            tessellation: 8,
        }, scene)
        blade.material = bladeMat
        blade.position.y = HANDLE_HEIGHT / 2 + BLADE_HEIGHT / 2
        blade.parent = saberRoot

        return saberRoot
    }

    const leftSaber = buildSaber('splashSaberL', CYAN, -SABER_SPREAD, SABER_TILT)
    const rightSaber = buildSaber('splashSaberR', MAGENTA, SABER_SPREAD, -SABER_TILT)

    // ── Accent lights near sabers ─────────────────────────────

    const lightL = new PointLight('splashLightL', new Vector3(-SABER_SPREAD, SABER_Y, SABER_Z + 0.5), scene)
    lightL.diffuse = CYAN
    lightL.intensity = 0.6
    lightL.range = 3

    const lightR = new PointLight('splashLightR', new Vector3(SABER_SPREAD, SABER_Y, SABER_Z + 0.5), scene)
    lightR.diffuse = MAGENTA
    lightR.intensity = 0.6
    lightR.range = 3

    // ── Pillar ring ───────────────────────────────────────────

    const ringRoot = new TransformNode('splashRing', scene)
    ringRoot.position.set(0, RING_Y, SABER_Z)
    ringRoot.parent = root

    for (let i = 0; i < RING_PILLAR_COUNT; i++) {
        const angle = (i / RING_PILLAR_COUNT) * Math.PI * 2
        const x = Math.cos(angle) * RING_RADIUS
        const z = Math.sin(angle) * RING_RADIUS
        const color = i % 2 === 0 ? PURPLE : PURPLE.scale(0.6)

        const mat = new StandardMaterial(`ringPillarMat${i}`, scene)
        mat.emissiveColor = color
        mat.disableLighting = true
        materials.push(mat)

        const pillar = MeshBuilder.CreateCylinder(`ringPillar${i}`, {
            height: 6,
            diameter: 0.08,
            tessellation: 8,
        }, scene)
        pillar.position.set(x, 0, z)
        pillar.material = mat
        pillar.parent = ringRoot
    }

    // ── Floor edge lines ──────────────────────────────────────

    const edgeMat = new StandardMaterial('splashEdgeMat', scene)
    edgeMat.emissiveColor = Color3.White().scale(0.5)
    edgeMat.disableLighting = true
    materials.push(edgeMat)

    for (const xPos of [-2, 2]) {
        const edge = MeshBuilder.CreateBox(`splashEdge${xPos}`, {
            width: 0.03,
            height: 0.02,
            depth: 20,
        }, scene)
        edge.position.set(xPos, 0, SABER_Z)
        edge.material = edgeMat
        edge.parent = root
    }

    // ── Animation system ──────────────────────────────────────

    let elapsed: Seconds = 0

    const animationSystem: System = (dt) => {
        elapsed += dt

        // Saber bobbing — opposite phase
        const bob = Math.sin(elapsed * BOB_SPEED * Math.PI * 2) * BOB_AMPLITUDE
        leftSaber.position.y = SABER_Y + bob
        rightSaber.position.y = SABER_Y - bob

        // Slow rotation drift
        leftSaber.rotation.y += ROTATE_SPEED * dt
        rightSaber.rotation.y -= ROTATE_SPEED * dt

        // Pillar ring rotation
        ringRoot.rotation.y += RING_ROTATE_SPEED * dt

        // Glow pulse
        glow.intensity = GLOW_BASE + Math.sin(elapsed * GLOW_SPEED * Math.PI * 2) * GLOW_AMPLITUDE
    }

    // ── Handle ────────────────────────────────────────────────

    return {
        systems: [animationSystem],

        dispose() {
            glow.dispose()
            lightL.dispose()
            lightR.dispose()
            for (const mat of materials) mat.dispose()
            root.dispose(false, true)
        },
    }
}
