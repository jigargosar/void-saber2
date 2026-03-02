import { type Scene } from '@babylonjs/core/scene'
import { type Theme, type System, type Teardown } from './types'
import { createStage } from './stage'
import { createSabers } from './saber'
import { type XRSession } from './xr-session'

export interface ArenaPage {
    readonly systems: readonly System[]
    onReturnToLobby(callback: () => void): Teardown
    dispose: Teardown
}

export function createArenaPage(
    scene: Scene,
    theme: Theme,
    xrSession: XRSession | null,
): ArenaPage {
    const stage = createStage(scene, theme)
    const sabers = createSabers(scene, theme)
    const returnListeners = new Set<() => void>()
    const teardowns: Teardown[] = []

    // Attach sabers to already-connected controllers
    if (xrSession) {
        for (const [hand, grip] of xrSession.controllers) {
            sabers.attach(hand, grip)
        }
        teardowns.push(xrSession.onControllerAdded((hand, grip) => {
            sabers.attach(hand, grip)
        }))
        teardowns.push(xrSession.onControllerRemoved((hand) => {
            sabers.detach(hand)
        }))
    }

    // Escape key to return to lobby (temporary, pause menu will replace this)
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
            return () => { returnListeners.delete(callback) }
        },

        dispose() {
            document.removeEventListener('keydown', onKey)
            returnListeners.clear()
            for (const td of teardowns) td()
            // Detach sabers from grips before disposing
            if (xrSession) {
                for (const [hand] of xrSession.controllers) {
                    sabers.detach(hand)
                }
            }
            sabers.dispose()
            stage.dispose()
        },
    }
}
