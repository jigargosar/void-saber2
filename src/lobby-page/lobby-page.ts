import { Scene } from '@babylonjs/core/scene'
import { Color4 } from '@babylonjs/core/Maths/math'
import { type System, type Teardown } from '../types'
import { type XRSession } from '../xr-session'
import { createMenu } from './menu'

const LOBBY_BG = new Color4(0.1, 0.1, 0.12, 1)

export interface LobbyPage {
    readonly systems: readonly System[]
    onPlay(callback: () => void): void
    dispose: Teardown
}

export function createLobbyPage(scene: Scene, xrSession: XRSession): LobbyPage {
    scene.clearColor = LOBBY_BG
    scene.fogMode = Scene.FOGMODE_NONE

    const menu = createMenu(scene)
    const playListeners = new Set<() => void>()

    // Squeeze grip to start playing
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
        },
    }
}
