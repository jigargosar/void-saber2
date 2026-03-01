Drop ECS, Establish Module Architecture

## Context

ECS libraries (Koota, Miniplex) cause more friction than they solve for this project. The entity inventory is 2 controllers, 2 sabers, 2 trails, singletons, and ~100 pooled cubes. The dominant data pattern is external Babylon.js object references, which no JS ECS library handles with clean type narrowing. We're removing Koota and replacing it with domain modules that own their data.

## Architecture Overview

Modules own their data (TDA/encapsulation). No central "world" or entity store. The composition root (main.ts) wires modules together. Each module exposes: setup function → handle, system function (per-frame), teardown.

Three ECS-independent patterns survive from the original project:
- **System pipeline**: ordered `(dt: Seconds) => void` functions, called per frame
- **Event queues**: fire-and-forget buffer, batched dispatch at end of frame
- **Teardown accumulator**: cleanup pattern for lifecycle management

## Immediate Changes (Milestones 1-2 refactor)

### 1. Create `src/types.ts`

Domain type aliases and shared interfaces:
```ts
type Seconds = number
type Hand = 'left' | 'right'
type System = (dt: Seconds) => void
type Teardown = () => void
```

Move `Theme`, `handColor()` here (currently in world.ts). Move `PillarPulseTarget` into stage.ts as private.

### 2. Create `src/pipeline.ts`

ECS-independent infrastructure:
- `createEventQueue<T>(handler)` — buffer + flush
- `createPipeline(systems, queues?)` — ordered execution + queue flush

Extracted from patterns proven in `void-saber/src/ecs.ts`.

### 3. Refactor `src/stage.ts`

Remove all Koota imports. Adopt the `createEnvironment()` closure pattern from `void-saber/src/game/environment.ts`:
- `BeatPulse` trait → `let beatFlash = 0` closure variable
- `BeatVisuals` trait → closure captures `pillarTargets`, `fogBaseDensity` directly
- `world.spawn()` → gone
- `world.onQueryRemove()` → `dispose()` method on handle
- Export `Environment` interface: `{ onBeat(), createBeatDecaySystem(), dispose() }`

### 4. Update `src/main.ts`

- Import from `types.ts` and `pipeline.ts` instead of `world.ts`
- Call `createEnvironment(scene, theme)`, capture handle
- Build system array from handle's `createBeatDecaySystem()`
- Remove `System` import from world.ts

### 5. Delete `src/world.ts`

All surviving types moved to types.ts. Koota world, traits gone.

### 6. Remove `koota` from dependencies

`pnpm remove koota`

### 7. Update docs

- Delete `docs/koota-ecs.md` (Koota reference, no longer relevant)
- Delete `docs/Koota-README.md` (library README, no longer relevant)
- Update `docs/architecture-ToE-review.md` — archive or annotate as superseded
- Update `CLAUDE.md` — remove Koota references, update architecture section

## Future Module Map (steps 3-23)

Not implemented now, but this is how the architecture extends:

```
controllers.ts   — bridgeInput(), tracks connected controllers per hand
saber.ts         — buildSaber() factory
trail.ts         — buildTrail() factory, startTrail(), constants
grip-bind.ts     — createGripBindSystem(): poll for grip, parent saber
trail-update.ts  — createTrailUpdateSystem(): per-frame vertex buffers
collision.ts     — segmentDistance() pure math
saber-collision.ts — blade-blade check, pushes SaberCollisionEvent
cube-pool.ts     — pre-created meshes, acquire/release, advance system
game-state.ts    — GameState discriminated union, phase gating
```

Step 3 intermediate shape: `Map<Hand, WebXRInputSource>` — stores raw input sources on connect, removes on disconnect. `isHand()` type guard in `types.ts` narrows XR handedness to `Hand`. No per-frame system (Babylon.js updates grip positions automatically).

Step 4+ evolves to `ControllerBundle` — ISI requires atomic creation with all fields present, so the bundle can't exist until sabers/trails do:
```ts
interface ControllerBundle {
  readonly hand: Hand
  readonly input: WebXRInputSource
  readonly saber: SaberVisual
  readonly trail: TrailBundle
  gripBound: boolean           // no nulls, no optionals
}
// Stored in Map<Hand, ControllerBundle>, max 2 entries
// Created atomically on controller connect, disposed on disconnect
```

## Files Modified

```
DELETE  src/world.ts
EDIT    src/main.ts
EDIT    src/stage.ts
CREATE  src/types.ts
CREATE  src/pipeline.ts
DELETE  docs/koota-ecs.md
DELETE  docs/Koota-README.md
EDIT    docs/architecture-ToE-review.md
EDIT    CLAUDE.md
EDIT    package.json (remove koota)
```

## Verification

1. `pnpm typecheck` — no type errors
2. `pnpm build` — builds successfully
3. `pnpm dev` — corridor scene renders, fog + pillar beat pulse works
4. WebXR emulator — VR session enters, corridor visible in headset
