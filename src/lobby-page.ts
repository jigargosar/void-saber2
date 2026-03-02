import { type Scene } from '@babylonjs/core/scene'
import { type Seed, type Difficulty, type System, type Teardown } from './types'
import { createMenu } from './menu'

export interface LobbyPage {
    readonly systems: readonly System[]
    onPlay(callback: (seed: Seed, difficulty: Difficulty) => void): Teardown
    dispose: Teardown
}

export function createLobbyPage(scene: Scene): LobbyPage {
    const menu = createMenu(scene)

    return {
        systems: [],

        onPlay(callback) {
            return menu.onPlay(callback)
        },

        dispose() {
            menu.dispose()
        },
    }
}
