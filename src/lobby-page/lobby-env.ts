import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Constants } from '@babylonjs/core/Engines/constants'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'
import { type Light } from '@babylonjs/core/Lights/light'
import { type Teardown } from '../types'

// ── Constants ────────────────────────────────────────────────────

const BG = new Color3(0.01, 0.01, 0.03)
const FOG_DENSITY = 0.04

const PILLAR_COUNT = 8
const PILLAR_GAP = 5
const PILLAR_X = 5
const PILLAR_HEIGHT = 6
const PILLAR_COLOR = new Color3(0.15, 0.05, 0.35)    // purple like arena
const PILLAR_ACCENT = new Color3(0.05, 0.3, 0.5)     // teal accent

const GROUND_SIZE = 50

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

    // ── Lighting — same pattern as arena ────────────────────────

    const hemi = new HemisphericLight('lobbyHemi', new Vector3(0, 1, 0), scene)
    hemi.intensity = 0.08
    lights.push(hemi)

    // ── Glow layer — same settings as arena ─────────────────────

    const glow = new GlowLayer('lobbyGlow', scene, {
        mainTextureSamples: 4,
        blurKernelSize: 64,
    })
    glow.intensity = 1.08
    glow.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
        if (mesh.material instanceof StandardMaterial) {
            const ec = mesh.material.emissiveColor
            result.set(ec.r, ec.g, ec.b, 1)
        } else {
            result.set(0, 0, 0, 0)
        }
    }

    // ── Ground ──────────────────────────────────────────────────

    const groundMat = new StandardMaterial('lobbyGroundMat', scene)
    groundMat.diffuseColor = new Color3(0.02, 0.02, 0.03)
    groundMat.specularColor = Color3.Black()
    materials.push(groundMat)

    const ground = MeshBuilder.CreateGround('lobbyGround', {
        width: GROUND_SIZE, height: GROUND_SIZE,
    }, scene)
    ground.material = groundMat
    ground.parent = root

    // ── Emissive pillars — self-illuminated, 4 pairs ────────────

    const pillarStart = Math.floor(PILLAR_COUNT / 2) * PILLAR_GAP / 2

    for (let i = 0; i < PILLAR_COUNT; i++) {
        const side = i % 2 === 0 ? -1 : 1
        const row = Math.floor(i / 2)
        const z = pillarStart - row * PILLAR_GAP - 3
        const color = i % 2 === 0 ? PILLAR_COLOR : PILLAR_ACCENT

        const mat = new StandardMaterial(`lobbyPillarMat${i}`, scene)
        mat.emissiveColor = color
        mat.disableLighting = true
        materials.push(mat)

        const pillar = MeshBuilder.CreateCylinder(`lobbyPillar${i}`, {
            height: PILLAR_HEIGHT, diameter: 0.15, tessellation: 12,
        }, scene)
        pillar.position.set(side * PILLAR_X, PILLAR_HEIGHT / 2, z)
        pillar.material = mat
        pillar.parent = root

        // Point light near ground at first 2 rows — illuminates the floor
        if (row < 2) {
            const ptLight = new PointLight(
                `lobbyPillarLight${i}`,
                new Vector3(side * PILLAR_X, 0.5, z),
                scene,
            )
            ptLight.diffuse = color
            ptLight.intensity = 0.6
            ptLight.range = 5
            lights.push(ptLight)
        }
    }

    // ── Particles — scattered dust ──────────────────────────────

    const particles = new ParticleSystem('lobbyParticles', 400, scene)
    particles.createBoxEmitter(
        new Vector3(0, 0.005, 0),
        new Vector3(0, 0.01, 0),
        new Vector3(-14, 0, -14),
        new Vector3(14, 6, 8),
    )
    particles.emitter = Vector3.Zero()

    const texSize = 32
    const texData = new Uint8Array(texSize * texSize * 4)
    const mid = (texSize - 1) / 2
    for (let y = 0; y < texSize; y++) {
        for (let x = 0; x < texSize; x++) {
            const dx = (x - mid) / mid
            const dy = (y - mid) / mid
            const a = Math.max(0, Math.exp(-(dx * dx + dy * dy) * 3))
            const idx = (y * texSize + x) * 4
            texData[idx] = 255
            texData[idx + 1] = 255
            texData[idx + 2] = 255
            texData[idx + 3] = Math.round(a * 255)
        }
    }
    particles.particleTexture = new RawTexture(
        texData, texSize, texSize,
        Constants.TEXTUREFORMAT_RGBA, scene, false, false,
    )

    particles.minSize = 0.02
    particles.maxSize = 0.06
    particles.minLifeTime = 8
    particles.maxLifeTime = 16
    particles.emitRate = 40
    particles.color1 = new Color4(0.3, 0.5, 0.8, 0.4)
    particles.color2 = new Color4(0.15, 0.3, 0.6, 0.25)
    particles.colorDead = new Color4(0, 0.05, 0.1, 0.0)
    particles.minEmitPower = 0.001
    particles.maxEmitPower = 0.003
    particles.gravity = new Vector3(0, 0.001, 0)
    particles.start()

    // ── Handle ──────────────────────────────────────────────────

    return {
        dispose() {
            particles.dispose()
            glow.dispose()
            for (const light of lights) light.dispose()
            for (const mat of materials) mat.dispose()
            root.dispose(false, true)
            scene.fogMode = Scene.FOGMODE_NONE
            scene.clearColor = new Color4(0, 0, 0, 1)
        },
    }
}
