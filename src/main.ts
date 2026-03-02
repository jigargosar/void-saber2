import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'

import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Materials/Node/Blocks'

import { type Theme, type System, type Teardown } from './types'
import { createSplash } from './splash-page/splash'
import { createLobbyPage } from './lobby-page/lobby-page'
import { createArenaPage } from './arena-page/arena-page'
import { createXRSession } from './xr-session'

const EYE_HEIGHT = 1.6

const theme: Theme = {
    leftHand: new Color3(0, 0.9, 0.95),
    rightHand: new Color3(0.95, 0, 0.7),
}

function setupEngine(): { engine: Engine; scene: Scene } {
    const canvas = document.getElementById('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Canvas element not found')
    }

    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)

    const camera = new FreeCamera('cam', new Vector3(0, EYE_HEIGHT, 0), scene)
    camera.setTarget(new Vector3(0, EYE_HEIGHT, -100))
    camera.attachControl()

    return { engine, scene }
}

// ── Router (manages full page lifecycle) ────────────────────

type SystemsSetter = (systems: readonly System[]) => void

type Route =
    | { readonly page: 'lobby' }
    | { readonly page: 'arena' }

async function createRouter(
    scene: Scene,
    setSystems: SystemsSetter,
): Promise<void> {
    // Splash while waiting for XR entry
    const splash = createSplash(scene)
    setSystems(splash.systems)

    const xrSession = await createXRSession(scene)
    splash.dispose()

    // Page navigation
    let teardown: Teardown = () => {}

    function navigate(route: Route): void {
        teardown()

        switch (route.page) {
            case 'lobby': {
                const lobby = createLobbyPage(scene)
                setSystems(lobby.systems)
                lobby.onPlay(() => { navigate({ page: 'arena' }) })
                teardown = () => { lobby.dispose() }
                break
            }
            case 'arena': {
                const arena = createArenaPage(scene, theme, xrSession)
                setSystems(arena.systems)
                arena.onReturnToLobby(() => { navigate({ page: 'lobby' }) })
                teardown = () => { arena.dispose() }
                break
            }
        }
    }

    navigate({ page: 'lobby' })
}

// ── Boot ────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { engine, scene } = setupEngine()

    let systems: readonly System[] = []

    // Render loop — always running, reads current systems
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000
        for (const system of systems) {
            system(dt)
        }
    })
    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())

    // Router owns all page lifecycle: splash → XR → lobby ↔ arena
    await createRouter(scene, (s) => { systems = s }) 
}

main().catch(console.error)
