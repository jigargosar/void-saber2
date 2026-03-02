import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'
import { type Light } from '@babylonjs/core/Lights/light'
import { type Theme, type Seconds, type System } from './types'

interface PillarPulseTarget {
    readonly mat: StandardMaterial
    readonly baseColor: Color3
}

const BG_COLOR = new Color3(0.01, 0.01, 0.03)
const FOG_DENSITY_BASE = 0.04
const PILLAR_COUNT = 14
const PILLAR_GAP = 6
const PILLAR_X = 6
const TRACK_HALF_LENGTH = 100
const RIB_COUNT = 20
const RIB_GAP = 10

// ── Setup (runs once, builds geometry) ──────────────────────

function setupAtmosphere(scene: Scene): void {
    scene.clearColor = new Color4(BG_COLOR.r, BG_COLOR.g, BG_COLOR.b, 1)
    scene.fogMode = Scene.FOGMODE_EXP2
    scene.fogDensity = FOG_DENSITY_BASE
    scene.fogColor = BG_COLOR
}

function setupLighting(scene: Scene, lights: Light[]): GlowLayer {
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene)
    hemi.intensity = 0.08
    lights.push(hemi)

    const glow = new GlowLayer('glow', scene, { mainTextureSamples: 4, blurKernelSize: 64 })
    glow.intensity = 1.08
    glow.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
        if (mesh.material instanceof StandardMaterial) {
            const ec = mesh.material.emissiveColor
            result.set(ec.r, ec.g, ec.b, 1)
        } else {
            result.set(0, 0, 0, 0)
        }
    }

    return glow
}

function setupTrack(scene: Scene, root: TransformNode, materials: StandardMaterial[]): void {
    const trackMat = new StandardMaterial('trackMat', scene)
    trackMat.diffuseColor = new Color3(0.02, 0.02, 0.03)
    trackMat.specularColor = Color3.Black()
    materials.push(trackMat)

    const track = MeshBuilder.CreateGround('track', { width: 4, height: TRACK_HALF_LENGTH * 2 }, scene)
    track.material = trackMat
    track.parent = root

    const edgeMatL = new StandardMaterial('edgeLeft', scene)
    edgeMatL.emissiveColor = Color3.White()
    edgeMatL.disableLighting = true
    materials.push(edgeMatL)

    const edgeMatR = new StandardMaterial('edgeRight', scene)
    edgeMatR.emissiveColor = Color3.White()
    edgeMatR.disableLighting = true
    materials.push(edgeMatR)

    const edgeL = MeshBuilder.CreateBox('edgeL', { width: 0.03, height: 0.02, depth: TRACK_HALF_LENGTH * 2 }, scene)
    edgeL.position.set(-2, 0.01, 0)
    edgeL.material = edgeMatL
    edgeL.parent = root

    const edgeR = MeshBuilder.CreateBox('edgeR', { width: 0.03, height: 0.02, depth: TRACK_HALF_LENGTH * 2 }, scene)
    edgeR.position.set(2, 0.01, 0)
    edgeR.material = edgeMatR
    edgeR.parent = root
}

function setupRibs(scene: Scene, theme: Theme, root: TransformNode, materials: StandardMaterial[]): void {
    const ribStart = Math.floor(RIB_COUNT / 2) * RIB_GAP

    const ribMatL = new StandardMaterial('ribLeft', scene)
    ribMatL.emissiveColor = theme.leftHand.scale(0.4)
    ribMatL.disableLighting = true
    materials.push(ribMatL)

    const ribMatR = new StandardMaterial('ribRight', scene)
    ribMatR.emissiveColor = theme.rightHand.scale(0.4)
    ribMatR.disableLighting = true
    materials.push(ribMatR)

    for (let i = 0; i < RIB_COUNT; i++) {
        const z = ribStart - i * RIB_GAP
        const mat = i % 2 === 0 ? ribMatL : ribMatR
        const rib = MeshBuilder.CreateCylinder(`rib${i}`, {
            height: 4, diameter: 0.03, tessellation: 8,
        }, scene)
        rib.rotation.z = Math.PI / 2
        rib.position.set(0, -0.04, z)
        rib.material = mat
        rib.parent = root
    }
}

function setupPillars(
    scene: Scene, theme: Theme, root: TransformNode,
    materials: StandardMaterial[], lights: Light[],
): PillarPulseTarget[] {
    const targets: PillarPulseTarget[] = []
    const pillarStart = Math.floor(PILLAR_COUNT / 2) * PILLAR_GAP

    for (let i = 0; i < PILLAR_COUNT; i++) {
        const z = pillarStart - i * PILLAR_GAP

        const matLeft = new StandardMaterial(`pillarMatL${i}`, scene)
        matLeft.emissiveColor = new Color3(0.4, 0, 0.6)
        matLeft.disableLighting = true
        materials.push(matLeft)
        const pillarLeft = MeshBuilder.CreateCylinder(`pillarL${i}`, { height: 8, diameter: 0.12, tessellation: 12 }, scene)
        pillarLeft.position.set(PILLAR_X, 2, z)
        pillarLeft.material = matLeft
        pillarLeft.parent = root
        targets.push({ mat: matLeft, baseColor: matLeft.emissiveColor.clone() })

        const matRight = new StandardMaterial(`pillarMatR${i}`, scene)
        matRight.emissiveColor = new Color3(0.4, 0, 0.6)
        matRight.disableLighting = true
        materials.push(matRight)
        const pillarRight = MeshBuilder.CreateCylinder(`pillarR${i}`, { height: 8, diameter: 0.12, tessellation: 12 }, scene)
        pillarRight.position.set(-PILLAR_X, 2, z)
        pillarRight.material = matRight
        pillarRight.parent = root
        targets.push({ mat: matRight, baseColor: matRight.emissiveColor.clone() })

        if (i < 2) {
            const lightLeft = new PointLight(`pointL${i}`, new Vector3(-PILLAR_X, 0.5, z), scene)
            lightLeft.diffuse = theme.leftHand
            lightLeft.intensity = 0.5
            lightLeft.range = 4
            lights.push(lightLeft)

            const lightRight = new PointLight(`pointR${i}`, new Vector3(PILLAR_X, 0.5, z), scene)
            lightRight.diffuse = theme.rightHand
            lightRight.intensity = 0.5
            lightRight.range = 4
            lights.push(lightRight)
        }
    }

    return targets
}

// ── Stage module ────────────────────────────────────────────

export interface Stage {
    onBeat(): void
    readonly beatDecaySystem: System
    dispose(): void
}

export function createStage(scene: Scene, theme: Theme): Stage {
    const root = new TransformNode('stageRoot', scene)
    const materials: StandardMaterial[] = []
    const lights: Light[] = []

    setupAtmosphere(scene)
    const glow = setupLighting(scene, lights)
    setupTrack(scene, root, materials)
    setupRibs(scene, theme, root, materials)
    const pillarTargets = setupPillars(scene, theme, root, materials, lights)

    let beatFlash = 0

    return {
        onBeat() {
            beatFlash = 1
        },

        beatDecaySystem: (dt: Seconds) => {
            if (beatFlash <= 0) return
            beatFlash = Math.max(0, beatFlash - dt / 0.12)

            scene.fogDensity = FOG_DENSITY_BASE * (1 + 0.8 * beatFlash)
            for (const { mat, baseColor } of pillarTargets) {
                mat.emissiveColor = baseColor.scale(1 + 1.5 * beatFlash)
            }
        },

        dispose() {
            glow.dispose()
            for (const light of lights) light.dispose()
            for (const mat of materials) mat.dispose()
            root.dispose(false, true) // dispose all child meshes
            scene.fogMode = Scene.FOGMODE_NONE
            scene.clearColor = new Color4(0, 0, 0, 1)
        },
    }
}
