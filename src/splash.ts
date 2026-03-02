import { type Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Vector3, Color4 } from '@babylonjs/core/Maths/math'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture'
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock'
import { Control } from '@babylonjs/gui/2D/controls/control'
import { type System, type Teardown } from './types'

const BG_COLOR = new Color4(0.01, 0.01, 0.03, 1)
const ACCENT = '#00e5ff'
const DIM = '#555566'
const FONT = 'Consolas, monospace'

const PANEL_WIDTH = 2
const PANEL_HEIGHT = 1
const PANEL_Y = 1.4
const PANEL_Z = -3
const TEXTURE_WIDTH = 512
const TEXTURE_HEIGHT = 256

// Pulse animation: title glows between dim and bright
const PULSE_SPEED = 1.8
const PULSE_MIN = 0.4
const PULSE_MAX = 1.0

export interface Splash {
    readonly systems: readonly System[]
    dispose: Teardown
}

export function createSplash(scene: Scene): Splash {
    scene.clearColor = BG_COLOR

    const plane = MeshBuilder.CreatePlane('splashPlane', {
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
    }, scene)
    plane.position = new Vector3(0, PANEL_Y, PANEL_Z)
    plane.rotation.y = Math.PI

    const planeMat = new StandardMaterial('splashPlaneMat', scene)
    planeMat.disableLighting = true
    planeMat.emissiveColor.set(1, 1, 1)
    plane.material = planeMat

    const texture = AdvancedDynamicTexture.CreateForMesh(
        plane,
        TEXTURE_WIDTH,
        TEXTURE_HEIGHT,
    )

    const title = new TextBlock('splashTitle', 'VOID SABER')
    title.fontFamily = FONT
    title.fontSize = 64
    title.color = ACCENT
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
    title.topInPixels = -30
    texture.addControl(title)

    const hint = new TextBlock('splashHint', 'Click "Enter VR" to begin')
    hint.fontFamily = FONT
    hint.fontSize = 20
    hint.color = DIM
    hint.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER
    hint.topInPixels = 40
    texture.addControl(hint)

    let elapsed = 0

    const pulseSystem: System = (dt) => {
        elapsed += dt * PULSE_SPEED
        const t = (Math.sin(elapsed) + 1) / 2
        const brightness = PULSE_MIN + t * (PULSE_MAX - PULSE_MIN)
        planeMat.emissiveColor.set(brightness, brightness, brightness)
    }

    return {
        systems: [pulseSystem],

        dispose() {
            texture.dispose()
            planeMat.dispose()
            plane.dispose()
        },
    }
}
