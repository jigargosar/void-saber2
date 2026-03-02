import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'

import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Materials/Node/Blocks'

import { type Seed, type Difficulty, type Theme, type System, type Teardown } from './types'
import { createSplash } from './splash-page/splash'
import { createLobbyPage } from './lobby-page/lobby-page'
import { createArenaPage } from './arena-page/arena-page'
import { createXRSession, type XRSession } from './xr-session'
import { type Command, type CommandQueue, createCommandQueue } from './command-queue'

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
    | { readonly page: 'arena'; readonly seed: Seed; readonly difficulty: Difficulty }

interface Router {
    activeSystems(): readonly System[]
    handleCommand(command: Command): void
}

function createRouter(scene: Scene, queue: CommandQueue): Router {
    let currentSystems: readonly System[] = []
    let teardown: Teardown = () => {}

    function navigate(route: Route): void {
        teardown()

        switch (route.page) {
            case 'lobby': {
                const lobby = createLobbyPage(scene, queue)
                currentSystems = lobby.systems
                teardown = () => { lobby.dispose() }
                break
            }
            case 'arena': {
                const arena = createArenaPage(scene, theme, xrSession, route.seed, route.difficulty, queue)
                currentSystems = arena.systems
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
    }).catch(console.error)

    function handleCommand(command: Command): void {
        switch (command.type) {
            case 'navigateToArena':
                navigate({ page: 'arena', seed: command.seed, difficulty: command.difficulty })
                break
            case 'returnToLobby':
            case 'songEnd':
                navigate({ page: 'lobby' })
                break
        }
    }

    return {
        activeSystems() { return currentSystems },
        handleCommand,
    }
}

// ── Boot ────────────────────────────────────────────────────

function main(): void {
    const { engine, scene } = setupEngine()
    const queue = createCommandQueue()
    const router = createRouter(scene, queue)

    scene.onBeforeRenderObservable.add(() => {
        queue.drain((command) => router.handleCommand(command))

        const dt = engine.getDeltaTime() / 1000
        for (const system of router.activeSystems()) {
            system(dt)
        }
    })
    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main()
