import { Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'
import { type Theme, world, BeatPulse } from './world'

const BG_COLOR = new Color3(0.01, 0.01, 0.03)
const FOG_BASE = 0.04
const PILLAR_COUNT = 14
const PILLAR_GAP = 6
const PILLAR_X = 6
const TRACK_HALF = 100
const RIB_COUNT = 20
const RIB_GAP = 10

interface PillarPulseTarget {
    readonly mat: StandardMaterial
    readonly baseColor: Color3
}

export interface Arena {
    triggerBeat(): void
    dispose(): void
    createBeatDecaySystem(getDelta: () => number): () => void
    createBeatRenderSystem(): () => void
}

// ── Setup functions ─────────────────────────────────────────

function setupAtmosphere(scene: Scene): void {
    scene.clearColor = new Color4(BG_COLOR.r, BG_COLOR.g, BG_COLOR.b, 1)
    scene.fogMode = Scene.FOGMODE_EXP2
    scene.fogDensity = FOG_BASE
    scene.fogColor = BG_COLOR
}

function setupLighting(scene: Scene): GlowLayer {
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0))
    hemi.intensity = 0.08

    const glow = new GlowLayer('glow', scene, { mainTextureSamples: 4, blurKernelSize: 64 })
    glow.intensity = 1.08
    glow.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
        if (mesh.name.endsWith('Trail') || mesh.name === 'saberSparks') {
            result.set(0, 0, 0, 0)
            return
        }
        if (mesh.material instanceof StandardMaterial) {
            const ec = mesh.material.emissiveColor
            result.set(ec.r, ec.g, ec.b, 1)
        } else {
            result.set(0, 0, 0, 0)
        }
    }

    return glow
}

function setupTrack(): void {
    const trackMat = new StandardMaterial('trackMat')
    trackMat.diffuseColor = new Color3(0.02, 0.02, 0.03)
    trackMat.specularColor = Color3.Black()

    const track = MeshBuilder.CreateGround('track', { width: 4, height: TRACK_HALF * 2 })
    track.material = trackMat

    const edgeMatL = new StandardMaterial('edgeLeft')
    edgeMatL.emissiveColor = Color3.White()
    edgeMatL.disableLighting = true

    const edgeMatR = new StandardMaterial('edgeRight')
    edgeMatR.emissiveColor = Color3.White()
    edgeMatR.disableLighting = true

    const edgeL = MeshBuilder.CreateBox('edgeL', { width: 0.03, height: 0.02, depth: TRACK_HALF * 2 })
    edgeL.position.set(-2, 0.01, 0)
    edgeL.material = edgeMatL

    const edgeR = MeshBuilder.CreateBox('edgeR', { width: 0.03, height: 0.02, depth: TRACK_HALF * 2 })
    edgeR.position.set(2, 0.01, 0)
    edgeR.material = edgeMatR
}

function setupRibs(theme: Theme): void {
    const ribStart = Math.floor(RIB_COUNT / 2) * RIB_GAP

    const ribMatL = new StandardMaterial('ribLeft')
    ribMatL.emissiveColor = theme.leftHand.scale(0.4)
    ribMatL.disableLighting = true

    const ribMatR = new StandardMaterial('ribRight')
    ribMatR.emissiveColor = theme.rightHand.scale(0.4)
    ribMatR.disableLighting = true

    for (let i = 0; i < RIB_COUNT; i++) {
        const z = ribStart - i * RIB_GAP
        const mat = i % 2 === 0 ? ribMatL : ribMatR
        const rib = MeshBuilder.CreateCylinder(`rib${i}`, {
            height: 4, diameter: 0.03, tessellation: 8,
        })
        rib.rotation.z = Math.PI / 2
        rib.position.set(0, -0.04, z)
        rib.material = mat
    }
}

function setupPillars(theme: Theme): PillarPulseTarget[] {
    const snapshots: PillarPulseTarget[] = []
    const pillarStart = Math.floor(PILLAR_COUNT / 2) * PILLAR_GAP

    for (let i = 0; i < PILLAR_COUNT; i++) {
        const z = pillarStart - i * PILLAR_GAP

        const mL = new StandardMaterial(`pillarMatL${i}`)
        mL.emissiveColor = new Color3(0.4, 0, 0.6)
        mL.disableLighting = true
        const pL = MeshBuilder.CreateCylinder(`pillarL${i}`, { height: 8, diameter: 0.12, tessellation: 12 })
        pL.position.set(PILLAR_X, 2, z)
        pL.material = mL
        snapshots.push({ mat: mL, baseColor: mL.emissiveColor.clone() })

        const mR = new StandardMaterial(`pillarMatR${i}`)
        mR.emissiveColor = new Color3(0.4, 0, 0.6)
        mR.disableLighting = true
        const pR = MeshBuilder.CreateCylinder(`pillarR${i}`, { height: 8, diameter: 0.12, tessellation: 12 })
        pR.position.set(-PILLAR_X, 2, z)
        pR.material = mR
        snapshots.push({ mat: mR, baseColor: mR.emissiveColor.clone() })

        if (i < 2) {
            const lL = new PointLight(`pointL${i}`, new Vector3(-PILLAR_X, 0.5, z))
            lL.diffuse = theme.leftHand
            lL.intensity = 0.5
            lL.range = 4

            const lR = new PointLight(`pointR${i}`, new Vector3(PILLAR_X, 0.5, z))
            lR.diffuse = theme.rightHand
            lR.intensity = 0.5
            lR.range = 4
        }
    }

    return snapshots
}

// ── Beat systems ────────────────────────────────────────────

export function createBeatDecaySystem(getDelta: () => number): () => void {
    return () => {
        for (const entity of world.query(BeatPulse)) {
            const pulse = entity.get(BeatPulse)
            if (!pulse || pulse.intensity <= 0) continue
            const dt = getDelta()
            pulse.intensity = Math.max(0, pulse.intensity - dt / 0.12)
        }
    }
}

export function createBeatRenderSystem(
    scene: Scene,
    pillarSnapshots: PillarPulseTarget[],
): () => void {
    return () => {
        for (const entity of world.query(BeatPulse)) {
            const pulse = entity.get(BeatPulse)
            if (!pulse) continue
            scene.fogDensity = FOG_BASE * (1 + 0.8 * pulse.intensity)
            for (const { mat, baseColor } of pillarSnapshots) {
                mat.emissiveColor = baseColor.scale(1 + 1.5 * pulse.intensity)
            }
        }
    }
}

// ── Orchestrator ────────────────────────────────────────────

export function createArena(scene: Scene, theme: Theme): Arena {
    setupAtmosphere(scene)
    const glow = setupLighting(scene)
    setupTrack()
    setupRibs(theme)
    const pillarSnapshots = setupPillars(theme)

    const beatEntity = world.spawn(BeatPulse())

    return {
        triggerBeat() {
            const pulse = beatEntity.get(BeatPulse)
            if (pulse) pulse.intensity = 1
        },
        dispose() {
            beatEntity.destroy()
            glow.dispose()
        },
        createBeatDecaySystem: (getDelta) => createBeatDecaySystem(getDelta),
        createBeatRenderSystem: () => createBeatRenderSystem(scene, pillarSnapshots),
    }
}
