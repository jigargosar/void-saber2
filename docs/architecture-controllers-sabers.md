Controllers + Sabers — Build Steps 3-4

## Step 3: `src/controllers.ts`

`createControllers(xrInput, theme)` → `Controllers` handle.

Listens to `onControllerAddedObservable` / `onControllerRemovedObservable`.
Stores state in `Map<Hand, ControllerEntry>`.
Filters out `handedness === 'none'` via `isHand()` guard.

On connect:
- `buildSaber(name, color)` → parent `saber.root` to `source.grip`
- Store `{ input, saber }` in map

On disconnect:
- `saber.root.dispose(false, true)` — meshes + materials
- Remove from map

Grip is available at connect time — Babylon.js creates the grip mesh
synchronously in the `WebXRInputSource` constructor (confirmed:
`webXRInputSource.js:45-46`), before `onControllerAddedObservable` fires.
No polling needed, no `gripBound` flag.

```ts
interface ControllerEntry {
    readonly input: WebXRInputSource
    readonly saber: SaberVisual
}

interface Controllers {
    get(hand: Hand): ControllerEntry | undefined
    dispose: Teardown
}
```

No per-frame system. Purely event-driven.

## Step 4: `src/saber.ts`

Stateless factory, no module handle.

`buildSaber(name, color)` → `SaberVisual`

Creates under a `TransformNode` root:
- Handle cylinder (dark steel, diffuse lit)
- Blade cylinder (emissive, `disableLighting: true`)
- `BladeBase` and `BladeTip` transform nodes (collision endpoints)

Root is rotated `PI/2` on X so blade points forward along grip.

Types live in `saber.ts` (move to shared only when multiple unrelated modules need them):
```ts
interface BladeSegment {
    readonly base: TransformNode
    readonly tip: TransformNode
}

interface SaberVisual {
    readonly root: TransformNode
    readonly blade: BladeSegment
}
```

## Wiring (in `main.ts`)

```ts
const xr = await setupWebXR(scene)
const controllers = createControllers(xr.input, theme)
```

No grip-bind module. Controller lifecycle and saber creation/disposal
are one concern, handled in one place.

## Files

```
CREATE  src/controllers.ts
CREATE  src/saber.ts
EDIT    src/main.ts
EDIT    src/types.ts (isHand guard)
```

## Decisions

- Grip binding is event-driven, not polled. `source.grip` exists at connect time.
- No separate `grip-bind.ts` — saber lifecycle is part of controller lifecycle.
- `BladeSegment`, `SaberVisual` types live in `saber.ts`, not `types.ts`.
- Trail attachment point: `BladeTip` — confirmed by reference project (step 5 concern).
