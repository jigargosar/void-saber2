import { type Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { type Mesh } from '@babylonjs/core/Meshes/mesh'
import { type Vector3 } from '@babylonjs/core/Maths/math'
import { type Seconds, type Theme, type System, type Teardown, handColor } from '../types'
import { type Cue } from './choreography'

const POOL_SIZE = 10
const SPAWN_Z = -60
const HIT_Z = 0
const DESPAWN_Z = 2
const SPEED = 10
const CUBE_SIZE = 0.5
export const TRAVEL_DURATION: Seconds = (HIT_Z - SPAWN_Z) / SPEED

const LANE_POSITIONS = [-0.75, -0.25, 0.25, 0.75]
const ROW_POSITIONS = [0.5, 1.0, 1.5]

// HACK: beat flash via onBeat callback — replace with arena event queue
const BEAT_FLASH_SCALE = 1.5
const BEAT_FLASH_DECAY = 0.12

interface CubeEntry {
    readonly mesh: Mesh
    readonly mat: StandardMaterial
    spawnTime: Seconds
    active: boolean
}

export interface ActiveCube {
    readonly position: Vector3
    deactivate(): void
}

export interface Cubes {
    readonly hitRadius: number
    readonly system: System
    onBeat(): void
    forEachActive(callback: (cube: ActiveCube) => void): void
    dispose: Teardown
}

export function createCubes(
    scene: Scene,
    theme: Theme,
    getCurrentTime: () => Seconds,
    cues: readonly Cue[],
): Cubes {
    const pool: CubeEntry[] = []

    for (let i = 0; i < POOL_SIZE; i++) {
        const mat = new StandardMaterial(`cubeMat${i}`, scene)
        mat.disableLighting = true

        const mesh = MeshBuilder.CreateBox(`cube${i}`, { size: CUBE_SIZE }, scene)
        mesh.material = mat
        mesh.isVisible = false

        pool.push({ mesh, mat, spawnTime: 0, active: false })
    }

    let cueIndex = 0
    let beatFlash = 0

    function activate(entry: CubeEntry, cue: Cue): void {
        entry.active = true
        entry.spawnTime = cue.beatTime - TRAVEL_DURATION
        entry.mat.emissiveColor = handColor(theme, cue.hand)
        entry.mesh.position.set(
            LANE_POSITIONS[cue.lane],
            ROW_POSITIONS[cue.row],
            SPAWN_Z,
        )
        entry.mesh.isVisible = true
    }

    function deactivate(entry: CubeEntry): void {
        entry.active = false
        entry.mesh.isVisible = false
    }

    const system: System = (dt) => {
        const songTime = getCurrentTime()

        // Spawn cues whose spawn time has arrived
        while (cueIndex < cues.length) {
            const cue = cues[cueIndex]
            const spawnTime = cue.beatTime - TRAVEL_DURATION
            if (songTime < spawnTime) break

            const inactive = pool.find(e => !e.active)
            if (inactive) {
                activate(inactive, cue)
            }
            cueIndex++
        }

        // Decay beat flash
        if (beatFlash > 0) {
            beatFlash = Math.max(0, beatFlash - dt / BEAT_FLASH_DECAY)
        }

        for (const entry of pool) {
            if (!entry.active) continue
            entry.mesh.position.z = SPAWN_Z + SPEED * (songTime - entry.spawnTime)
            if (entry.mesh.position.z > DESPAWN_Z) {
                deactivate(entry)
                continue
            }
            const scale = 1 + BEAT_FLASH_SCALE * beatFlash
            entry.mesh.scaling.setAll(scale)
        }
    }

    return {
        hitRadius: CUBE_SIZE / 2,
        system,

        onBeat() {
            beatFlash = 1
        },

        forEachActive(callback) {
            for (const entry of pool) {
                if (!entry.active) continue
                callback({
                    position: entry.mesh.position,
                    deactivate: () => deactivate(entry),
                })
            }
        },

        dispose() {
            for (const { mesh, mat } of pool) {
                mesh.dispose()
                mat.dispose()
            }
        },
    }
}
