import { type Scene } from '@babylonjs/core/scene'
import { type System, type Teardown } from '../types'
import { type XRSession } from '../xr-session'
import { createLobbyEnv } from './lobby-env'
import { createMenu } from './menu'

export interface LobbyPage {
    readonly systems: readonly System[]
    onPlay(callback: () => void): void
    dispose: Teardown
}

export function createLobbyPage(scene: Scene, xrSession: XRSession): LobbyPage {
    const env = createLobbyEnv(scene)
    const menu = createMenu(scene)
    const playListeners = new Set<() => void>()

    // Squeeze grip to start playing (temporary — phase 2 replaces with laser pointer)
    const squeezeTeardown = xrSession.onSqueeze(() => {
        for (const cb of playListeners) cb()
    })

    return {
        systems: [],

        onPlay(callback) {
            playListeners.add(callback)
        },

        dispose() {
            squeezeTeardown()
            playListeners.clear()
            menu.dispose()
            env.dispose()
        },
    }
}
