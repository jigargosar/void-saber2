import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'

import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Materials/Node/Blocks'

import { type Theme, type System, type Teardown } from './types'
import { createSplash } from './splash'
import { createLobbyPage } from './lobby-page'
import { createArenaPage } from './arena-page'
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

// ── Router (manages page switching, lives in main) ──────────

interface Router {
    readonly systems: readonly System[]
    dispose: Teardown
}

function createRouter(
    scene: Scene,
    xrSession: XRSession,
): Router {
    const state = { systems: [] as readonly System[], teardown: (() => {}) as Teardown }

    function showLobby(): void {
        state.teardown()
        const lobby = createLobbyPage(scene)
        state.systems = lobby.systems
        lobby.onPlay((_seed, _difficulty) => {
            showArena()
        })
        state.teardown = () => { lobby.dispose() }
    }

    function showArena(): void {
        state.teardown()
        const arena = createArenaPage(scene, theme, xrSession)
        state.systems = arena.systems
        arena.onReturnToLobby(() => { showLobby() })
        state.teardown = () => { arena.dispose() }
    }

    showLobby()

    return {
        get systems() { return state.systems },

        dispose() {
            state.teardown()
            state.systems = []
            state.teardown = () => {}
        },
    }
}

// ── Boot sequence ───────────────────────────────────────────

async function main(): Promise<void> {
    const { engine, scene } = setupEngine()

    // Splash renders while "Enter VR" button waits for user
    const splash = createSplash(scene)
    let systems: readonly System[] = splash.systems

    // Render loop — always running, reads current systems
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000
        for (const system of systems) {
            system(dt)
        }
    })
    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())

    // Await user entering VR — splash visible the whole time
    const xrSession = await createXRSession(scene)
    splash.dispose()

    // Router takes over — lobby first
    const router = createRouter(scene, xrSession)
    systems = router.systems
}

main().catch(console.error)
