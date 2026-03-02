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
    dispose: Teardown
}

/**
 * Creates the WebXR helper and waits for the user to actually enter VR.
 * Resolves only after the session is IN_XR — caller gets a guaranteed-live session.
 * Rejects if XR setup fails.
 */
export function createXRSession(scene: Scene): Promise<XRSession> {
    return new Promise((resolve, reject) => {
        WebXRDefaultExperience.CreateAsync(scene, {
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
        }).then((xr) => {
            const controllers = new Map<Hand, TransformNode>()
            const addListeners = new Set<ControllerAddedCallback>()
            const removeListeners = new Set<ControllerRemovedCallback>()

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

            const session: XRSession = {
                controllers,

                onControllerAdded(callback) {
                    addListeners.add(callback)
                    return () => { addListeners.delete(callback) }
                },

                onControllerRemoved(callback) {
                    removeListeners.add(callback)
                    return () => { removeListeners.delete(callback) }
                },

                dispose() {
                    addListeners.clear()
                    removeListeners.clear()
                    controllers.clear()
                    xr.dispose()
                },
            }

            // Wait for user to actually enter VR before resolving
            xr.baseExperience.onStateChangedObservable.add((state) => {
                if (state === WebXRState.IN_XR) {
                    resolve(session)
                }
            })
        }).catch(reject)
    })
}
