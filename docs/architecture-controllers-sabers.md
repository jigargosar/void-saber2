Controllers + Sabers — Build Steps 3-4

## Step 3: `src/controllers.ts`

`createControllers(xrInput, onConnect, onDisconnect)` → `Controllers` handle.

Controllers knows nothing about sabers. It listens to XR observables and
forwards events via DI callbacks. The composition root (main.ts) decides
what happens on connect/disconnect.

```ts
type OnConnect = (hand: Hand, source: WebXRInputSource) => void
type OnDisconnect = (hand: Hand) => void

interface Controllers {
    dispose: Teardown
}

function createControllers(
    xrInput: WebXRInput,
    onConnect: OnConnect,
    onDisconnect: OnDisconnect,
): Controllers
```

Internals:
- Subscribes to `onControllerAddedObservable` / `onControllerRemovedObservable`
- Filters `handedness === 'none'` via `isHand()` guard
- Calls `onConnect(hand, source)` / `onDisconnect(hand)` — nothing else
- `dispose()` removes both observers

No per-frame system. No internal state beyond observer references.
Purely event-driven.

Grip is available at connect time — Babylon.js creates the grip mesh
synchronously in the `WebXRInputSource` constructor (confirmed:
`webXRInputSource.js:45-46`), before `onControllerAddedObservable` fires.
No polling needed, no `gripBound` flag.

## Step 4: `src/saber.ts`

Stateless factory, no module handle.

`buildSaber(name, color)` → `TransformNode` (root)

Creates under a `TransformNode` root:
- Handle cylinder (dark steel, diffuse lit)
- Blade cylinder (emissive, `disableLighting: true`)

Root is rotated `PI/2` on X so blade points forward along grip.

Future steps (trails, collision) will add `BladeSegment` / `SaberVisual`
types when needed. For now, `buildSaber` returns the root node directly.

## Wiring (in `main.ts`)

```ts
const xr = await setupWebXR(scene)
const _controllers = createControllers(
    xr.input,
    (hand, source) => {
        if (!source.grip) return
        const saber = buildSaber(`${hand}Saber`, handColor(theme, hand))
        saber.parent = source.grip
    },
    (hand) => {
        // dispose saber by hand — requires tracking, deferred to implementation
    },
)
```

Main.ts extracts `source.grip` (TransformNode) and parents the saber to it.
Sabers never import XR types. Controllers never import saber types.

## Files

```
CREATE  src/controllers.ts
CREATE  src/saber.ts
EDIT    src/main.ts
EDIT    src/types.ts (isHand guard, handColor helper)
```

## Decisions

- Grip binding is event-driven, not polled. `source.grip` exists at connect time.
- No separate `grip-bind.ts` — too little logic to justify a module.
- DI callbacks on `createControllers` — controllers is a thin event bridge, not an orchestrator.
- Main.ts owns the connect/disconnect wiring. Coupling is explicit and visible.
- `buildSaber` returns bare `TransformNode` for now. `SaberVisual`/`BladeSegment` added when trails/collision need them.
- Types stay in their owning module until multiple unrelated modules need them.
