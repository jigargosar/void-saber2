import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'

import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Materials/Node/Blocks'

import { type Theme, type System, type Teardown } from './types'
import { createSplashPage } from './splash-page'
import { createLobbyPage } from './lobby-page'
import { createArenaPage } from './arena-page'
import { createXRSession, type XRSession } from './xr-session'

const EYE_HEIGHT = 1.6

const theme: Theme = {
    leftHand: new Color3(0, 0.9, 0.95),
    rightHand: new Color3(0.95, 0, 0.7),
}

// ── Router ────────────────────────────────────────────────────

interface Router {
    currentSystems(): readonly System[]
    dispose: Teardown
}

function createRouter(scene: Scene, theme: Theme): Router {
    let activeSystems: readonly System[] = []
    let disposePage: Teardown = () => {}
    let xrSession: XRSession | null = null

    function showSplash(): void {
        disposePage()
        const splash = createSplashPage(scene)
        activeSystems = splash.systems
        disposePage = () => { splash.dispose() }
    }

    function showLobby(): void {
        disposePage()
        const lobby = createLobbyPage(scene)
        activeSystems = lobby.systems
        lobby.onPlay((_seed, _difficulty) => {
            showArena()
        })
        disposePage = () => { lobby.dispose() }
    }

    function showArena(): void {
        disposePage()
        const arena = createArenaPage(scene, theme, xrSession)
        activeSystems = arena.systems
        arena.onReturnToLobby(() => { showLobby() })
        disposePage = () => { arena.dispose() }
    }

    // Boot: splash while waiting for user to enter VR
    showSplash()

    createXRSession(scene).then((session) => {
        if (!session) return
        xrSession = session
        session.onEnterXR(() => { showLobby() })
    }).catch(console.error)

    return {
        currentSystems() { return activeSystems },

        dispose() {
            disposePage()
            xrSession?.dispose()
        },
    }
}

// ── Engine bootstrap ──────────────────────────────────────────

function setupCamera(scene: Scene) {
    const camera = new FreeCamera('cam', new Vector3(0, EYE_HEIGHT, 0), scene)
    camera.setTarget(new Vector3(0, EYE_HEIGHT, -100))
    camera.attachControl()
}

function setupEngine(): { engine: Engine; scene: Scene } {
    const canvas = document.getElementById('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Canvas element not found')
    }

    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)
    setupCamera(scene)
    return { engine, scene }
}

function main(): void {
    const { engine, scene } = setupEngine()
    const router = createRouter(scene, theme)

    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000
        for (const system of router.currentSystems()) {
            system(dt)
        }
    })

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main()
