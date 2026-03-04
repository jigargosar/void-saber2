import { type Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math'
import { type Seed, type Theme, type System, type Teardown } from '../types'
import { composeMusic } from '../music/music-composer'
import { createMusicPlayer } from '../music/music-player'
import { createStage } from './stage'
import { createSabers } from './saber'
import { createCubes, TRAVEL_DURATION } from './cubes'
import { createChoreography } from './choreography'
import { extractBeatTimeline } from '../music/beat-timeline'
import { type XRSession } from '../xr-session'
import { type CommandQueue } from '../command-queue'

export interface ArenaPage {
    readonly systems: readonly System[]
    dispose: Teardown
}

export function createArenaPage(
    scene: Scene,
    theme: Theme,
    xrSession: XRSession,
    seed: Seed,
    queue: CommandQueue,
): ArenaPage {
    const stage = createStage(scene, theme)
    const sabers = createSabers(scene, theme)

    const composition = composeMusic(seed)
    const musicPlayer = createMusicPlayer(
        composition,
        () => { stage.onBeat() },
        queue,
    )

    const beatTimeline = extractBeatTimeline(composition)
    const choreography = createChoreography(composition, beatTimeline, {
        difficulty: 'normal',
        startOffset: TRAVEL_DURATION,
        endOffset: 2.0,
    })
    const cubes = createCubes(scene, theme, musicPlayer.currentTime, choreography.cues)

    musicPlayer.start().catch(console.error)

    // Attach sabers to controllers
    for (const [hand, grip] of xrSession.controllers) {
        sabers.attach(hand, grip)
    }

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            queue.enqueue({ type: 'arenaSessionCompleted' })
        }
    }
    document.addEventListener('keydown', onKey)

    // ── Collision: segment-to-sphere check ──────────────────
    const segAB = new Vector3()
    const segAP = new Vector3()

    function distanceSegmentToPoint(segA: Vector3, segB: Vector3, point: Vector3): number {
        segB.subtractToRef(segA, segAB)
        point.subtractToRef(segA, segAP)
        const lenSq = segAB.lengthSquared()
        const t = Math.max(0, Math.min(1, Vector3.Dot(segAP, segAB) / lenSq))
        const closestX = segA.x + segAB.x * t
        const closestY = segA.y + segAB.y * t
        const closestZ = segA.z + segAB.z * t
        const dx = point.x - closestX
        const dy = point.y - closestY
        const dz = point.z - closestZ
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    const collisionSystem: System = () => {
        cubes.forEachActive((cube) => {
            sabers.forEachBlade((tip, base) => {
                if (distanceSegmentToPoint(tip, base, cube.position) < cubes.hitRadius) {
                    cube.deactivate()
                }
            })
        })
    }

    return {
        systems: [
            stage.beatDecaySystem,
            sabers.trailUpdateSystem,
            cubes.system,
            collisionSystem,
        ],

        dispose() {
            document.removeEventListener('keydown', onKey)
            musicPlayer.dispose()
            for (const [hand] of xrSession.controllers) {
                sabers.detach(hand)
            }
            cubes.dispose()
            sabers.dispose()
            stage.dispose()
        },
    }
}
