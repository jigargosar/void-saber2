import { type WebXRInput } from '@babylonjs/core/XR/webXRInput'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { type Hand, type Teardown, type Theme, isHand, handColor } from './types'
import { buildSaber } from './saber'

export interface Controllers {
    dispose: Teardown
}

export function createControllers(xrInput: WebXRInput, theme: Theme): Controllers {
    const sabers = new Map<Hand, TransformNode>()

    const onAdded = xrInput.onControllerAddedObservable.add((source) => {
        const handedness = source.inputSource.handedness
        if (!isHand(handedness)) return

        const saber = buildSaber(`${handedness}Saber`, handColor(theme, handedness))
        if (source.grip) {
            saber.parent = source.grip
        }
        sabers.set(handedness, saber)
    })

    const onRemoved = xrInput.onControllerRemovedObservable.add((source) => {
        const handedness = source.inputSource.handedness
        if (!isHand(handedness)) return

        const saber = sabers.get(handedness)
        if (!saber) return
        saber.dispose(false, true)
        sabers.delete(handedness)
    })

    return {
        dispose() {
            for (const saber of sabers.values()) {
                saber.dispose(false, true)
            }
            sabers.clear()
            xrInput.onControllerAddedObservable.remove(onAdded)
            xrInput.onControllerRemovedObservable.remove(onRemoved)
        },
    }
}
