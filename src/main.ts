import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'

import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Materials/Node/Blocks'

import { type Theme, type System, type Teardown } from './types'
import { createLobbyPage } from './lobby-page'
import { createArenaPage } from './arena-page'
import { createXRSession, type XRSession } from './xr-session'

const EYE_HEIGHT = 1.6

const theme: Theme = {
    leftHand: new Color3(0, 0.9, 0.95),
    rightHand: new Color3(0.95, 0, 0.7),
}

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

    // Router state
    let activeSystems: readonly System[] = []
    let disposePage: Teardown = () => {}
    let xrSession: XRSession | null = null

    function showLobby(): void {
        disposePage()
        const lobby = createLobbyPage(scene)
        activeSystems = lobby.systems
        lobby.onPlay((seed, difficulty) => {
            console.log(`Play: seed=${seed}, difficulty=${difficulty}`)
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

    // Boot into lobby
    showLobby()

    // XR session — persistent across page transitions
    createXRSession(scene).then((session) => {
        xrSession = session
    }).catch(console.error)

    // Game loop reads active page's systems
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000
        for (const system of activeSystems) {
            system(dt)
        }
    })

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main()
