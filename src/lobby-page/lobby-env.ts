import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { SpotLight } from '@babylonjs/core/Lights/spotLight'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Constants } from '@babylonjs/core/Engines/constants'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'
import { type Teardown } from '../types'

// ── Constants ────────────────────────────────────────────────────

const BG = new Color3(0.01, 0.04, 0.08)              // dark blue-teal
const FOG_COLOR = new Color3(0.02, 0.06, 0.1)       // blue-teal fog — creates atmospheric wash
const FOG_DENSITY = 0.018

const SPOT_COLOR = new Color3(0.2, 0.7, 0.9)        // bright teal
const SPOT_POSITION = new Vector3(0, 15, -8)         // above and behind menu panels
const SPOT_DIRECTION = new Vector3(0, -0.7, 0.7)     // down and forward toward menu
const SPOT_ANGLE = Math.PI / 2                       // very wide cone
const SPOT_EXPONENT = 0.8                            // slow falloff
const SPOT_INTENSITY = 10

const GROUND_SIZE = 60
const GROUND_BORDER_SIZE = 14                        // wireframe border rectangle
const GROUND_BORDER_COLOR = new Color3(0.03, 0.15, 0.25)


// ── Public interface ─────────────────────────────────────────────

export interface LobbyEnv {
    dispose: Teardown
}

export function createLobbyEnv(scene: Scene): LobbyEnv {
    const root = new TransformNode('lobbyEnvRoot', scene)
    const materials: StandardMaterial[] = []

    // ── Atmosphere ───────────────────────────────────────────────

    scene.clearColor = new Color4(BG.r, BG.g, BG.b, 1)
    scene.fogMode = Scene.FOGMODE_EXP2
    scene.fogDensity = FOG_DENSITY
    scene.fogColor = FOG_COLOR

    // ── Spotlight — atmospheric gradient through fog ─────────────

    const spot = new SpotLight(
        'lobbySpot',
        SPOT_POSITION,
        SPOT_DIRECTION,
        SPOT_ANGLE,
        SPOT_EXPONENT,
        scene,
    )
    spot.diffuse = SPOT_COLOR
    spot.intensity = SPOT_INTENSITY
    spot.range = 60

    // ── Hemisphere light — ambient blue fill from below ──────────

    const hemi = new HemisphericLight('lobbyHemi', new Vector3(0, -1, 0), scene)
    hemi.diffuse = new Color3(0.02, 0.02, 0.04)     // very dim top
    hemi.groundColor = new Color3(0.04, 0.12, 0.18)  // teal from below
    hemi.intensity = 1.5

    // ── Glow layer ───────────────────────────────────────────────

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

    // ── Ground ───────────────────────────────────────────────────

    const groundMat = new StandardMaterial('lobbyGroundMat', scene)
    groundMat.diffuseColor = new Color3(0.03, 0.03, 0.05)
    groundMat.specularColor = new Color3(0.05, 0.1, 0.15)
    groundMat.specularPower = 32
    materials.push(groundMat)

    const ground = MeshBuilder.CreateGround('lobbyGround', {
        width: GROUND_SIZE, height: GROUND_SIZE,
    }, scene)
    ground.material = groundMat
    ground.parent = root

    // ── Ground wireframe border ──────────────────────────────────

    const borderMat = new StandardMaterial('lobbyBorderMat', scene)
    borderMat.emissiveColor = GROUND_BORDER_COLOR
    borderMat.disableLighting = true
    materials.push(borderMat)

    const half = GROUND_BORDER_SIZE / 2
    const borderY = 0.01
    const borderPoints = [
        new Vector3(-half, borderY, -half),
        new Vector3(half, borderY, -half),
        new Vector3(half, borderY, half),
        new Vector3(-half, borderY, half),
        new Vector3(-half, borderY, -half),
    ]
    const border = MeshBuilder.CreateLines('lobbyBorder', {
        points: borderPoints,
    }, scene)
    border.color = new Color3(GROUND_BORDER_COLOR.r, GROUND_BORDER_COLOR.g, GROUND_BORDER_COLOR.b)
    border.parent = root

    // ── Particles — drifting blue dust ────────────────────────────

    const particles = new ParticleSystem('lobbyParticles', 400, scene)
    particles.createBoxEmitter(
        new Vector3(0, 0.005, 0),
        new Vector3(0, 0.01, 0),
        new Vector3(-16, 0, -20),
        new Vector3(16, 8, 4),
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

    // ── Handle ───────────────────────────────────────────────────

    return {
        dispose() {
            particles.dispose()
            border.dispose()
            glow.dispose()
            hemi.dispose()
            spot.dispose()
            for (const mat of materials) mat.dispose()
            root.dispose(false, true)
            scene.fogMode = Scene.FOGMODE_NONE
            scene.clearColor = new Color4(0, 0, 0, 1)
        },
    }
}
