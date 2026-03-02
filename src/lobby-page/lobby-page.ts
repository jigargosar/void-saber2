import { type Scene } from '@babylonjs/core/scene'
import { type Seed, type System, type Teardown } from '../types'
import { type CommandQueue } from '../command-queue'
import { createLobbyEnv } from './lobby-env'
// import { createMenu } from './menu'  // hidden while building env

export interface LobbyPage {
    readonly systems: readonly System[]
    dispose: Teardown
}

export function createLobbyPage(scene: Scene, queue: CommandQueue): LobbyPage {
    const env = createLobbyEnv(scene)
    // const menu = createMenu(scene)  // hidden while building env

    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            queue.enqueue({ type: 'navigateToArena', seed: 42 as Seed, difficulty: 'medium' })
        }
    }
    document.addEventListener('keydown', onKey)

    return {
        systems: [],

        dispose() {
            document.removeEventListener('keydown', onKey)
            // menu.dispose()  // hidden while building env
            env.dispose()
        },
    }
}
