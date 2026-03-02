import { type Scene } from '@babylonjs/core/scene'
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience'
import { WebXRState } from '@babylonjs/core/XR/webXRTypes'
import { type TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { type Hand, type Teardown, isHand } from './types'

type ControllerAddedCallback = (hand: Hand, grip: TransformNode) => void
type ControllerRemovedCallback = (hand: Hand) => void

export interface XRSession {
    readonly controllers: ReadonlyMap<Hand, TransformNode>
    onControllerAdded(callback: ControllerAddedCallback): Teardown
    onControllerRemoved(callback: ControllerRemovedCallback): Teardown
    onEnterXR(callback: () => void): Teardown
    dispose: Teardown
}

export async function createXRSession(scene: Scene): Promise<XRSession | null> {
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
        uiOptions: { sessionMode: 'immersive-vr' },
        disableTeleportation: true,
        disablePointerSelection: true,
        disableNearInteraction: false,
        disableHandTracking: false,
        inputOptions: {
            doNotLoadControllerMeshes: true,
            disableControllerAnimation: false,
            disableOnlineControllerRepository: false,
            controllerOptions: {},
        },
    }).catch((err) => { console.error(err); return undefined })

    if (!xr) return null

    const controllers = new Map<Hand, TransformNode>()
    const addListeners = new Set<ControllerAddedCallback>()
    const removeListeners = new Set<ControllerRemovedCallback>()
    const enterXRListeners = new Set<() => void>()

    xr.baseExperience.onStateChangedObservable.add((state) => {
        if (state === WebXRState.IN_XR) {
            for (const cb of enterXRListeners) cb()
        }
    })

    xr.input.onControllerAddedObservable.add((source) => {
        const hand = source.inputSource.handedness
        if (!isHand(hand) || !source.grip) return
        controllers.set(hand, source.grip)
        for (const cb of addListeners) cb(hand, source.grip)
    })

    xr.input.onControllerRemovedObservable.add((source) => {
        const hand = source.inputSource.handedness
        if (!isHand(hand)) return
        controllers.delete(hand)
        for (const cb of removeListeners) cb(hand)
    })

    return {
        controllers,

        onControllerAdded(callback) {
            addListeners.add(callback)
            return () => { addListeners.delete(callback) }
        },

        onControllerRemoved(callback) {
            removeListeners.add(callback)
            return () => { removeListeners.delete(callback) }
        },

        onEnterXR(callback) {
            enterXRListeners.add(callback)
            return () => { enterXRListeners.delete(callback) }
        },

        dispose() {
            addListeners.clear()
            removeListeners.clear()
            enterXRListeners.clear()
            controllers.clear()
            xr.dispose()
        },
    }
}
