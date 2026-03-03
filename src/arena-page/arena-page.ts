import { type Scene } from '@babylonjs/core/scene'
import { type Seed, type Theme, type System, type Teardown } from '../types'
import { composeMusic } from '../music/music-composer'
import { createMusicPlayer } from '../music/music-player'
import { createStage } from './stage'
import { createSabers } from './saber'
import { createCubes } from './cubes'
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

    const cubes = createCubes(scene, theme, musicPlayer.currentTime)

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

    return {
        systems: [
            stage.beatDecaySystem,
            sabers.trailUpdateSystem,
            cubes.system,
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
