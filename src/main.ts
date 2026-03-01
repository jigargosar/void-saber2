import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'

import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Materials/Node/Blocks'


import { type Theme, type System, isHand } from './types'
import { createStage } from './stage'
import { type Sabers, createSabers } from './saber'

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

// XR observable wiring is composition root work, not a separate module.
// If future steps need controller lookup by hand (haptics, menu buttons),
// extract a controllers module then.
async function setupXR(scene: Scene, sabers: Sabers): Promise<void> {
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
        uiOptions: { sessionMode: 'immersive-vr' },
        disableTeleportation: true,
        disablePointerSelection: false,
        disableNearInteraction: false,
        disableHandTracking: false,
        inputOptions: {
            doNotLoadControllerMeshes: true,
            disableControllerAnimation: false,
            disableOnlineControllerRepository: false,
            controllerOptions: {},
        },
    }).catch((err) => { console.error(err); return undefined })
    if (!xr) return

    xr.input.onControllerAddedObservable.add((source) => {
        const hand = source.inputSource.handedness
        if (!isHand(hand) || !source.grip) return
        sabers.attach(hand, source.grip)
    })

    xr.input.onControllerRemovedObservable.add((source) => {
        const hand = source.inputSource.handedness
        if (!isHand(hand)) return
        sabers.detach(hand)
    })
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

    const stage = createStage(scene, theme)
    const sabers = createSabers(scene, theme)
    setupXR(scene, sabers).catch(console.error)

    startGameLoop(scene, [
        stage.beatDecaySystem,
    ])

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main()
