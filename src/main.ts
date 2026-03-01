import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'

import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Materials/Node/Blocks'


import { type Theme, type System } from './types'
import { createStage } from './stage'
import { createControllers } from './controllers'

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

async function setupWebXR(scene: Scene): Promise<WebXRDefaultExperience> {
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
        uiOptions: { sessionMode: 'immersive-vr' },
        disableTeleportation: true,
        disablePointerSelection: false,
        disableNearInteraction: false,
        disableHandTracking: false,
        inputOptions: {
            doNotLoadControllerMeshes: false,
            disableControllerAnimation: false,
            disableOnlineControllerRepository: false,
            controllerOptions: {},
        },
    })
    return xr
}

function startGameLoop(scene: Scene, systems: System[]): void {
    const engine = scene.getEngine()
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000
        for (const system of systems) {
            system(dt)
        }
    })
}

function createScene() {
    const canvas = document.getElementById('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Canvas element not found')
    }

    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)
    return { engine, scene }
}

async function main(): Promise<void> {
    const { engine, scene } = createScene()

    const stage = createStage(scene, theme)
    setupCamera(scene)
    setupWebXR(scene).catch(console.error)

    startGameLoop(scene, [
        stage.beatDecaySystem,
    ])

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main().catch(console.error)
