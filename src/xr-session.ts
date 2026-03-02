import { type Scene } from '@babylonjs/core/scene'
import { WebXRDefaultExperience } from '@babylonjs/core/XR/webXRDefaultExperience'
import { WebXRState } from '@babylonjs/core/XR/webXRTypes'
import { type TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { type Hand, type Teardown, isHand } from './types'

export interface XRSession {
    readonly controllers: ReadonlyMap<Hand, TransformNode>
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
            disableNearInteraction: true,
            disableHandTracking: true,
            inputOptions: {
                doNotLoadControllerMeshes: true,
                disableControllerAnimation: true,
                disableOnlineControllerRepository: false,
            },
        }).then((xr) => {
            const controllers = new Map<Hand, TransformNode>()

            xr.input.onControllerAddedObservable.add((source) => {
                const hand = source.inputSource.handedness
                if (!isHand(hand) || !source.grip) return
                controllers.set(hand, source.grip)
            })

            const session: XRSession = {
                controllers,

                dispose() {
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
