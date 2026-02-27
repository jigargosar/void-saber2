import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'

const BG = new Color3(0.01, 0.01, 0.03)
const FOG_DENSITY = 0.04
const EYE_HEIGHT = 1.6

function setupEnvironment(scene: Scene) {
    scene.clearColor = new Color4(BG.r, BG.g, BG.b, 1)
    scene.fogMode = Scene.FOGMODE_EXP2
    scene.fogDensity = FOG_DENSITY
    scene.fogColor = BG
}

function setupCamera(scene: Scene) {
    const camera = new FreeCamera('cam', new Vector3(0, EYE_HEIGHT, 0), scene)
    camera.setTarget(new Vector3(0, EYE_HEIGHT, -100))
    camera.attachControl()
}

function main(): void {

    const canvas = document.getElementById('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Canvas element not found')
    }

    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)

    setupEnvironment(scene)
    setupCamera(scene)

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main()
