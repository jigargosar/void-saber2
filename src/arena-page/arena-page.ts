import { type Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math'
import { type Seed, type Theme, type System, type Teardown } from '../types'
import { createRhythmGrid } from '../music/rhythm-grid'
import { composeMusic } from '../music/music-composer'
import { createMusicPlayer } from '../music/music-player'
import { createStage } from './stage'
import { createSabers } from './saber'
import { createCubes, TRAVEL_DURATION } from './cubes'
import { createChoreography } from './choreography'
import { createArenaEventQueue, createBeatSchedule, createSongEndDetector } from './arena-events'
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
    // ── Rhythm grid (master timing source) ───────────────────
    const grid = createRhythmGrid(seed)

    // ── Music ────────────────────────────────────────────────
    const composition = composeMusic(grid)
    const musicPlayer = createMusicPlayer(grid, composition)

    // ── Arena event queue (intra-arena communication) ────────
    const arenaQueue = createArenaEventQueue()
    const beatSchedule = createBeatSchedule(
        composition.kickEvents.map(e => e.time),
        musicPlayer.currentTime,
        arenaQueue,
    )
    const songEndDetector = createSongEndDetector(
        grid.totalTime,
        musicPlayer.currentTime,
        arenaQueue,
    )

    // ── Stage + sabers ───────────────────────────────────────
    const stage = createStage(scene, theme)
    const sabers = createSabers(scene, theme)

    // ── Choreography + cubes ─────────────────────────────────
    const choreography = createChoreography(grid, {
        difficulty: 'normal',
        startOffset: TRAVEL_DURATION,
        endOffset: 2.0,
    })
    const cubes = createCubes(scene, theme, musicPlayer.currentTime, choreography.cues)

    // ── Start music ──────────────────────────────────────────
    musicPlayer.start().catch(console.error)

    // ── Attach sabers to controllers ─────────────────────────
    for (const [hand, grip] of xrSession.controllers) {
        sabers.attach(hand, grip)
    }

    // ── Keyboard escape ──────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            queue.enqueue({ type: 'arenaSessionCompleted' })
        }
    }
    document.addEventListener('keydown', onKey)

    // ── Arena event handler ──────────────────────────────────
    const arenaEventSystem: System = () => {
        arenaQueue.drain((event) => {
            switch (event.type) {
                case 'beat':
                    stage.onBeat()
                    cubes.onBeat()
                    break
                case 'songEnd':
                    musicPlayer.stop()
                    queue.enqueue({ type: 'arenaSessionCompleted' })
                    break
            }
        })
    }

    // ── Collision: segment-to-sphere check ───────────────────
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
            beatSchedule.system,
            songEndDetector.system,
            arenaEventSystem,
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
