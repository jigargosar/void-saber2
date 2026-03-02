import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math'
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience'
import { GUI3DManager } from '@babylonjs/gui/3D/gui3DManager'
import { HolographicButton } from '@babylonjs/gui/3D/controls/holographicButton'

import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Materials/Node/Blocks'

const EYE_HEIGHT = 1.6

// ── Room builders ────────────────────────────────────────────

function buildRoomA(scene: Scene, parent: TransformNode): void {
    const floor = MeshBuilder.CreateGround('floorA', { width: 8, height: 8 }, scene)
    floor.parent = parent
    const floorMat = new StandardMaterial('floorMatA', scene)
    floorMat.diffuseColor = new Color3(0.15, 0.05, 0.2)
    floor.material = floorMat

    // Purple pillars
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2
        const pillar = MeshBuilder.CreateCylinder(`pillarA${i}`, { height: 3, diameter: 0.3 }, scene)
        pillar.position = new Vector3(Math.cos(angle) * 3, 1.5, Math.sin(angle) * 3)
        pillar.parent = parent
        const mat = new StandardMaterial(`pillarMatA${i}`, scene)
        mat.emissiveColor = new Color3(0.4, 0.0, 0.6)
        mat.disableLighting = true
        pillar.material = mat
    }

    // Floating sphere
    const sphere = MeshBuilder.CreateSphere('sphereA', { diameter: 0.6 }, scene)
    sphere.position = new Vector3(0, 2, 0)
    sphere.parent = parent
    const sphereMat = new StandardMaterial('sphereMatA', scene)
    sphereMat.emissiveColor = new Color3(0.0, 0.8, 1.0)
    sphereMat.disableLighting = true
    sphere.material = sphereMat
}

function buildRoomB(scene: Scene, parent: TransformNode): void {
    const floor = MeshBuilder.CreateGround('floorB', { width: 8, height: 8 }, scene)
    floor.parent = parent
    const floorMat = new StandardMaterial('floorMatB', scene)
    floorMat.diffuseColor = new Color3(0.05, 0.15, 0.1)
    floor.material = floorMat

    // Green boxes
    for (let i = 0; i < 3; i++) {
        const box = MeshBuilder.CreateBox(`boxB${i}`, { size: 0.8 }, scene)
        box.position = new Vector3((i - 1) * 2, 0.4, -2)
        box.parent = parent
        const mat = new StandardMaterial(`boxMatB${i}`, scene)
        mat.emissiveColor = new Color3(0.0, 0.6, 0.3)
        mat.disableLighting = true
        box.material = mat
    }

    // Floating torus
    const torus = MeshBuilder.CreateTorus('torusB', { diameter: 1, thickness: 0.2 }, scene)
    torus.position = new Vector3(0, 2, 0)
    torus.parent = parent
    const torusMat = new StandardMaterial('torusMatB', scene)
    torusMat.emissiveColor = new Color3(1.0, 0.5, 0.0)
    torusMat.disableLighting = true
    torus.material = torusMat
}

// ── Switch logic ─────────────────────────────────────────────

function switchTo(enable: TransformNode, disable: TransformNode): void {
    disable.setEnabled(false)
    enable.setEnabled(true)
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement
    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)

    const camera = new FreeCamera('cam', new Vector3(0, EYE_HEIGHT, 3), scene)
    camera.setTarget(new Vector3(0, EYE_HEIGHT, 0))
    camera.attachControl()

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)
    light.intensity = 0.3

    // Two root nodes — one per room
    const roomA = new TransformNode('roomA', scene)
    const roomB = new TransformNode('roomB', scene)

    buildRoomA(scene, roomA)
    buildRoomB(scene, roomB)

    // Room background colors
    const roomAColor = new Color4(0.1, 0.05, 0.25, 1)
    const roomBColor = new Color4(0.05, 0.2, 0.12, 1)

    // Start with room A visible
    scene.clearColor = roomAColor
    roomB.setEnabled(false)

    // 3D GUI buttons
    const guiManager = new GUI3DManager(scene)

    const btnToB = new HolographicButton('btnToB')
    guiManager.addControl(btnToB)
    btnToB.text = 'Go to Room B'
    btnToB.position = new Vector3(0, 1.2, -1.5)
    btnToB.scaling = new Vector3(0.4, 0.4, 0.4)
    btnToB.onPointerClickObservable.add(() => switchTo(roomB, roomA))

    const btnToA = new HolographicButton('btnToA')
    guiManager.addControl(btnToA)
    btnToA.text = 'Go to Room A'
    btnToA.position = new Vector3(0, 1.2, -1.5)
    btnToA.scaling = new Vector3(0.4, 0.4, 0.4)
    btnToA.onPointerClickObservable.add(() => switchTo(roomA, roomB))

    // Buttons need to toggle with rooms — but they're not parented to rooms
    // because GUI3DManager owns them. Toggle visibility manually.
    btnToA.isVisible = false

    const originalSwitchTo = switchTo
    function switchWithButtons(enable: TransformNode, disable: TransformNode): void {
        originalSwitchTo(enable, disable)
        scene.clearColor = (enable === roomA) ? roomAColor : roomBColor
        // Show button for the OTHER room
        btnToB.isVisible = (enable === roomA)
        btnToA.isVisible = (enable === roomB)
    }

    // Re-wire button clicks to use the version that toggles buttons too
    btnToB.onPointerClickObservable.clear()
    btnToA.onPointerClickObservable.clear()
    btnToB.onPointerClickObservable.add(() => switchWithButtons(roomB, roomA))
    btnToA.onPointerClickObservable.add(() => switchWithButtons(roomA, roomB))

    // XR — pointer selection enabled for button clicks
    await WebXRDefaultExperience.CreateAsync(scene, {
        uiOptions: { sessionMode: 'immersive-vr' },
        disableTeleportation: true,
        disablePointerSelection: false,
    }).catch(console.error)

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

main().catch(console.error)
