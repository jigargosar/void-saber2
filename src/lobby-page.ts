import { Scene } from '@babylonjs/core/scene'
import { Color4 } from '@babylonjs/core/Maths/math'
import { type Seed, type Difficulty, type System, type Teardown } from './types'
import { createMenu } from './menu'

const LOBBY_BG = new Color4(0.1, 0.1, 0.12, 1)

export interface LobbyPage {
    readonly systems: readonly System[]
    onPlay(callback: (seed: Seed, difficulty: Difficulty) => void): Teardown
    dispose: Teardown
}

export function createLobbyPage(scene: Scene): LobbyPage {
    scene.clearColor = LOBBY_BG
    scene.fogMode = Scene.FOGMODE_NONE

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
