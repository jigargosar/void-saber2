import { type Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { type Mesh } from '@babylonjs/core/Meshes/mesh'
import { type Theme, type System, type Teardown, type Hand, handColor } from '../types'

const POOL_SIZE = 10
const SPAWN_INTERVAL = 1.0
const SPAWN_Z = -60
const DESPAWN_Z = 2
const SPEED = 10
const CUBE_SIZE = 0.5

const LANE_POSITIONS = [-0.75, -0.25, 0.25, 0.75] as const
const ROW_POSITIONS = [0.5, 1.0, 1.5] as const

interface CubeEntry {
    readonly mesh: Mesh
    readonly mat: StandardMaterial
    active: boolean
}

interface SpawnDef {
    readonly lane: number
    readonly row: number
    readonly hand: Hand
}

const HARDCODED_PATTERN: readonly SpawnDef[] = [
    { lane: 1, row: 1, hand: 'left' },
    { lane: 2, row: 1, hand: 'right' },
    { lane: 0, row: 0, hand: 'left' },
    { lane: 3, row: 2, hand: 'right' },
    { lane: 1, row: 2, hand: 'left' },
    { lane: 2, row: 0, hand: 'right' },
    { lane: 0, row: 1, hand: 'left' },
    { lane: 3, row: 1, hand: 'right' },
    { lane: 1, row: 0, hand: 'left' },
    { lane: 2, row: 2, hand: 'right' },
]

export interface Cubes {
    readonly system: System
    dispose: Teardown
}

export function createCubes(scene: Scene, theme: Theme): Cubes {
    const pool: CubeEntry[] = []

    for (let i = 0; i < POOL_SIZE; i++) {
        const mat = new StandardMaterial(`cubeMat${i}`, scene)
        mat.disableLighting = true

        const mesh = MeshBuilder.CreateBox(`cube${i}`, { size: CUBE_SIZE }, scene)
        mesh.material = mat
        mesh.isVisible = false

        pool.push({ mesh, mat, active: false })
    }

    let elapsedTime = 0
    let nextSpawnTime = 1.0
    let patternIndex = 0

    function activate(entry: CubeEntry, def: SpawnDef): void {
        entry.active = true
        entry.mat.emissiveColor = handColor(theme, def.hand)
        entry.mesh.position.set(
            LANE_POSITIONS[def.lane],
            ROW_POSITIONS[def.row],
            SPAWN_Z,
        )
        entry.mesh.isVisible = true
    }

    function deactivate(entry: CubeEntry): void {
        entry.active = false
        entry.mesh.isVisible = false
    }

    const system: System = (dt) => {
        elapsedTime += dt

        if (elapsedTime >= nextSpawnTime) {
            const inactive = pool.find(e => !e.active)
            if (inactive) {
                const def = HARDCODED_PATTERN[patternIndex % HARDCODED_PATTERN.length]
                activate(inactive, def)
                patternIndex++
            }
            nextSpawnTime += SPAWN_INTERVAL
        }

        for (const entry of pool) {
            if (!entry.active) continue
            entry.mesh.position.z += SPEED * dt
            if (entry.mesh.position.z > DESPAWN_Z) {
                deactivate(entry)
            }
        }
    }

    return {
        system,

        dispose() {
            for (const { mesh, mat } of pool) {
                mesh.dispose()
                mat.dispose()
            }
        },
    }
}
