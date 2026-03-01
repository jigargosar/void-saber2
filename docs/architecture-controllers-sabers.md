Controllers + Sabers — Build Steps 3-4

## Step 3: `src/controllers.ts`

`createControllers(xrInput)` → `Controllers` handle.

Listens to `onControllerAddedObservable` / `onControllerRemovedObservable`.
Stores controllers in `Map<Hand, WebXRInputSource>`.
Filters out `handedness === 'none'`.

Handle exposes:
- `get(hand): WebXRInputSource | undefined`
- `onConnect(cb: (hand, input) => void)` — fires for each new controller
- `onDisconnect(cb: (hand, input) => void)` — fires before removal
- `dispose()` — unsubscribes observables, clears map

## Step 4: `src/saber.ts`

Stateless factory, no module handle.

`buildSaber(name, color)` → `SaberVisual`

Creates under a `TransformNode` root:
- Handle cylinder (dark steel, diffuse lit)
- Blade cylinder (emissive, `disableLighting: true`)
- `BladeBase` and `BladeTip` transform nodes (collision endpoints)

Root is rotated `PI/2` on X so blade points forward along grip.

Interfaces:
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

## Wiring: `src/grip-bind.ts` (separate module)

`createGripBind(controllers, theme)` → `GripBind` handle.

On controller connect: `buildSaber()`, parent to controller grip, store in `Map<Hand, SaberVisual>`.
On controller disconnect: dispose saber, remove from map.

Handle exposes:
- `createGripBindSystem(): System` — polls for grip state each frame (if needed)
- `getSaber(hand): SaberVisual | undefined`
- `dispose()`

## Build order

Sabers are built lazily on controller connect — no invisible geometry, cleaner lifecycle.

## Open questions

- Does grip-bind need a per-frame system, or is it purely event-driven (connect/disconnect)?
- Trail attachment point: `BladeTip` — confirmed by reference project.

## Files

```
CREATE  src/controllers.ts
CREATE  src/saber.ts
CREATE  src/grip-bind.ts
EDIT    src/main.ts
EDIT    src/types.ts (BladeSegment, SaberVisual)
```
