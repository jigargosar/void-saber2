Architecture — Domain Modules, No ECS

## Why No ECS

ECS libraries (Koota, Miniplex) were evaluated and dropped:
- Koota: trait factories can't type external Babylon.js objects without nullable defaults — the dominant data pattern across all 23 build steps.
- Miniplex: best TypeScript ECS (optional properties + query narrowing), but development stalled.
- Entity inventory (2 controllers, 2 sabers, 2 trails, ~100 pooled cubes) doesn't justify ECS. Domain modules with closures suffice.

See `docs/BUILD-GUIDE.md` decisions section for the full rationale.

## Core Principle

Modules own their data. No central "world" or entity store. The composition root (`main.ts`) wires modules together. Coupling between modules is always visible in `main.ts`, never hidden inside modules.

## Module Pattern

Every domain module follows the same shape:

```ts
interface Stage {
    onBeat(): void
    readonly beatDecaySystem: System   // direct property, not factory
    dispose(): void
}

function createStage(scene: Scene, theme: Theme): Stage
```

1. `createXxx(deps...)` — setup function, builds geometry/state, returns a handle
2. Handle exposes: per-frame systems as readonly properties, domain methods, `dispose()`
3. Internal state lives in closure variables, not exported

Systems are direct properties (e.g. `stage.beatDecaySystem`), not factories (`createBeatDecaySystem()`). The system closes over everything it needs at setup time — no reason to defer creation.

## XR Wiring Pattern

Domain modules know nothing about WebXR. A `setupXR` factory function in main.ts connects XR events to domain modules by extracting the Babylon.js types each module needs. Its parameter list documents the coupling.

XR failure is graceful — app continues without VR (desktop corridor preview).

```ts
// main.ts — setupXR factory function
async function setupXR(scene: Scene, sabers: Sabers): Promise<void> {
    const xr = await WebXRDefaultExperience.CreateAsync(scene, { ... })
        .catch((err) => { console.error(err); return undefined })
    if (!xr) return

    xr.input.onControllerAddedObservable.add((source) => {
        const hand = source.inputSource.handedness
        if (!isHand(hand) || !source.grip) return
        sabers.attach(hand, source.grip)     // pass TransformNode, not XR type
    })

    xr.input.onControllerRemovedObservable.add((source) => {
        const hand = source.inputSource.handedness
        if (!isHand(hand)) return
        sabers.detach(hand)
    })
}
```

The pattern:
1. A domain module that knows nothing about XR (sabers, trails, menu, haptics)
2. `setupXR` hooks the relevant XR observable to the domain module's API
3. `setupXR` extracts the Babylon type the module needs (grip node, motion controller, mesh)
4. The domain module receives only what it needs — no XR imports

This scales linearly. Each new XR consumer adds a parameter to `setupXR` and a line to the connect/disconnect handlers. No module gains new dependencies. No architecture changes:

```ts
// Step 5: trails added as parameter, one line in connect handler
async function setupXR(scene: Scene, sabers: Sabers, trails: Trails): Promise<void> {
    // ...
    xr.input.onControllerAddedObservable.add((source) => {
        // ...
        sabers.attach(hand, source.grip)
        trails.attach(hand, sabers.get(hand))
    })
}

// Step 19: menu needs motion controller for button input
source.onMotionControllerInitObservable.addOnce((mc) => {
    menu.bindButtons(hand, mc)
})
```

Key discovery: Babylon.js creates the grip mesh synchronously in the `WebXRInputSource` constructor (`webXRInputSource.js:45-46`), before `onControllerAddedObservable` fires. No polling needed, no `gripBound` flag. Fully event-driven.

## Infrastructure

```ts
// types.ts
type Seconds = number
type Hand = 'left' | 'right'
type System = (dt: Seconds) => void
type Teardown = () => void
```

## Module Map

Current (steps 1-2):
```
main.ts          — composition root: engine, scene, XR, wires modules
types.ts         — domain type aliases, Theme, handColor()
stage.ts         — corridor geometry, beat pulse, fog/pillar systems
```

Steps 3-4 (sabers):
```
saber.ts         — createSabers() module, attach/detach, owns lifecycle
                    (no controllers.ts — XR wiring lives in main.ts)
```

Steps 5-6 (trails + collision):
```
trail.ts         — buildTrail() factory, startTrail(), constants
trail-update.ts  — per-frame vertex buffer update system
collision.ts     — segmentDistance() pure math
saber-collision.ts — blade-blade check, pushes SaberCollisionEvent
```

Steps 7-16 (gameplay):
```
music-engine.ts  — generateSong(), pure data
audio-player.ts  — Tone.js playback, onBeat callback
beat-clock.ts    — timing from AudioContext.currentTime
beatmap.ts       — BeatNote type, hardcoded JSON per song
cube-pool.ts     — pre-created meshes, acquire/release, advance system
cube-collision.ts — saber vs cube, pushes CubeHitEvent
score.ts         — hits/misses/streak, pure data
hud.ts           — VR score display
```

Steps 18-21 (state + UI):
```
game-state.ts    — GameState discriminated union, phase gating
menu.ts          — VR song list, laser pointer
countdown.ts     — 3-2-1, start audio
results.ts       — score display, retry/menu
```
