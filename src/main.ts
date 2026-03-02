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
import { createXRSession, type XRSession } from './xr-session'

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

type Route =
    | { readonly page: 'lobby' }
    | { readonly page: 'arena' }

interface Router {
    activeSystems(): readonly System[]
}

function createRouter(scene: Scene): Router {
    let currentSystems: readonly System[] = []
    let teardown: Teardown = () => {}

    function navigate(route: Route): void {
        teardown()

        switch (route.page) {
            case 'lobby': {
                const lobby = createLobbyPage(scene, xrSession)
                currentSystems = lobby.systems
                lobby.onPlay(() => { navigate({ page: 'arena' }) })
                teardown = () => { lobby.dispose() }
                break
            }
            case 'arena': {
                const arena = createArenaPage(scene, theme, xrSession)
                currentSystems = arena.systems
                arena.onReturnToLobby(() => { navigate({ page: 'lobby' }) })
                teardown = () => { arena.dispose() }
                break
            }
        }
    }

    // Splash while waiting for XR entry
    const splash = createSplash(scene)
    currentSystems = splash.systems

    let xrSession: XRSession
    createXRSession(scene).then((session) => {
        xrSession = session
        splash.dispose()
        navigate({ page: 'lobby' })

        // DEBUG: auto-navigate to arena after 3s (bypass grip)
        setTimeout(() => { navigate({ page: 'arena' }) }, 3000)
    }).catch(console.error)

    return {
        activeSystems() { return currentSystems },
    }
}

// ── Boot ────────────────────────────────────────────────────

function main(): void {
    const { engine, scene } = setupEngine()
    const router = createRouter(scene)

    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000
        for (const system of router.activeSystems()) {
            system(dt)
        }
    })
    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main()
