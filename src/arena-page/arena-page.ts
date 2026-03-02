import { type Scene } from '@babylonjs/core/scene'
import { type Seed, type Theme, type System, type Teardown } from '../types'
import { composeMusic } from '../music/music-composer'
import { createMusicPlayer } from '../music/music-player'
import { createStage } from './stage'
import { createSabers } from './saber'
import { type XRSession } from '../xr-session'

const HARDCODED_SEED = 42 as Seed

export interface ArenaPage {
    readonly systems: readonly System[]
    onReturnToLobby(callback: () => void): void
    dispose: Teardown
}

export function createArenaPage(
    scene: Scene,
    theme: Theme,
    xrSession: XRSession,
): ArenaPage {
    const stage = createStage(scene, theme)
    const sabers = createSabers(scene, theme)
    const returnListeners = new Set<() => void>()

    // Music pipeline — hardcoded seed
    const composition = composeMusic(HARDCODED_SEED)
    const musicPlayer = createMusicPlayer(
        composition,
        () => { stage.onBeat() },
        () => { for (const cb of returnListeners) cb() },
    )
    musicPlayer.start().catch(console.error)

    // Attach sabers to controllers
    for (const [hand, grip] of xrSession.controllers) {
        sabers.attach(hand, grip)
    }

    // Squeeze grip to return to lobby
    const squeezeTeardown = xrSession.onSqueeze(() => {
        for (const cb of returnListeners) cb()
    })

    // Escape key to return to lobby (dev shortcut)
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            for (const cb of returnListeners) cb()
        }
    }
    document.addEventListener('keydown', onKey)

    return {
        systems: [
            stage.beatDecaySystem,
            sabers.trailUpdateSystem,
        ],

        onReturnToLobby(callback) {
            returnListeners.add(callback)
        },

        dispose() {
            document.removeEventListener('keydown', onKey)
            squeezeTeardown()
            returnListeners.clear()
            musicPlayer.dispose()
            for (const [hand] of xrSession.controllers) {
                sabers.detach(hand)
            }
            sabers.dispose()
            stage.dispose()
        },
    }
}
