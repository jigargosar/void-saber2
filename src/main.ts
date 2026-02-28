import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3, Color3 } from '@babylonjs/core/Maths/math'
import { type Theme, type System } from './world'
import { setupStage, beatDecaySystem, beatRenderSystem } from './stage'

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

function startGameLoop(scene: Scene, systems: System[]): void {
    const engine = scene.getEngine()
    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000
        for (const system of systems) {
            system(dt)
        }
    })
}

function main(): void {
    const canvas = document.getElementById('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Canvas element not found')
    }

    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)

    setupStage(scene, theme)
    setupCamera(scene)

    startGameLoop(scene, [
        beatDecaySystem,
        beatRenderSystem,
    ])

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main()
