import { type Scene } from '@babylonjs/core/scene'
import { type System, type Teardown } from '../types'
import { createLobbyEnv } from './lobby-env'
import { createMenu } from './menu'

export interface LobbyPage {
    readonly systems: readonly System[]
    onPlay(callback: () => void): void
    dispose: Teardown
}

export function createLobbyPage(scene: Scene): LobbyPage {
    const env = createLobbyEnv(scene)
    const menu = createMenu(scene)
    const playListeners = new Set<() => void>()

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            for (const cb of playListeners) cb()
        }
    }
    document.addEventListener('keydown', onKey)

    return {
        systems: [],

        onPlay(callback) {
            playListeners.add(callback)
        },

        dispose() {
            document.removeEventListener('keydown', onKey)
            playListeners.clear()
            menu.dispose()
            env.dispose()
        },
    }
}
