import { type Scene } from '@babylonjs/core/scene'
import { type System, type Teardown } from '../types'
import { type CommandQueue } from '../command-queue'
import { createLobbyEnv } from './lobby-env'
import { createMenu } from './menu'

export interface LobbyPage {
    readonly systems: readonly System[]
    dispose: Teardown
}

export function createLobbyPage(scene: Scene, queue: CommandQueue): LobbyPage {
    const env = createLobbyEnv(scene)
    const menu = createMenu(scene, queue)

    return {
        systems: [],

        dispose() {
            menu.dispose()
            env.dispose()
        },
    }
}
