Controllers + Sabers — Build Steps 3-4

## Step 3: No `controllers.ts`

XR controller wiring lives directly in `main.ts`. No separate module.

Why: `createControllers` was a thin wrapper around two observable
subscriptions + an `isHand` filter. That's composition root work — wiring
XR events to domain modules. Wrapping it in a module added indirection
without encapsulating any real logic.

The wiring scales linearly. Each new XR consumer (trails, haptics) adds
a line to the same connect/disconnect handlers. No architecture changes.

If a future step needs to *look up* a controller by hand (e.g. haptics
needs the WebXRInputSource for pulse, menu needs motion controller for
buttons), that's when a controllers module earns its existence. Not before.

## Step 4: `src/saber.ts`

`createSabers(scene, theme)` → `Sabers` module handle.

Sabers is a proper module, not a stateless factory. It owns the
`Map<Hand, TransformNode>`, saber creation, grip parenting, and disposal.
Main.ts calls `attach`/`detach` — no domain logic leaks into the
composition root.

```ts
interface Sabers {
    attach(hand: Hand, grip: TransformNode): void
    detach(hand: Hand): void
    dispose: Teardown
}

function createSabers(scene: Scene, theme: Theme): Sabers
```

`buildSaber(name, color)` stays as a private helper inside the module
for geometry construction.

Creates under a `TransformNode` root:
- Handle cylinder (dark steel, diffuse lit)
- Blade cylinder (emissive, `disableLighting: true`)

Root is rotated `PI/2` on X so blade points forward along grip.

Grip is available at connect time — Babylon.js creates the grip mesh
synchronously in the `WebXRInputSource` constructor (confirmed:
`webXRInputSource.js:45-46`), before `onControllerAddedObservable` fires.
No polling needed, no `gripBound` flag.

## Wiring (in `main.ts`)

XR setup + controller wiring lives in a `setupXR` factory function inside
main.ts. Its parameter list documents the coupling. As consumers are added,
the signature grows: `setupXR(scene, sabers, trails, haptics)`.

XR failure is graceful — app continues without VR (desktop corridor preview).

```ts
// XR observable wiring is composition root work, not a separate module.
// If future steps need controller lookup by hand (haptics, menu buttons),
// extract a controllers module then.
async function setupXR(scene: Scene, sabers: Sabers): Promise<void> {
    const xr = await WebXRDefaultExperience.CreateAsync(scene, { ... })
        .catch((err) => { console.error(err); return undefined })
    if (!xr) return

    xr.input.onControllerAddedObservable.add((source) => {
        const hand = source.inputSource.handedness
        if (!isHand(hand) || !source.grip) return
        sabers.attach(hand, source.grip)
    })

    xr.input.onControllerRemovedObservable.add((source) => {
        const hand = source.inputSource.handedness
        if (!isHand(hand)) return
        sabers.detach(hand)
    })
}

// in main():
const sabers = createSabers(scene, theme)
setupXR(scene, sabers).catch(console.error)
```

Main.ts extracts `source.grip` (TransformNode) and passes it to sabers.
Sabers never import XR types. The grip null check is an XR boundary
concern — sabers shouldn't need to know grip can be undefined.

## Files

```
CREATE  src/saber.ts
EDIT    src/main.ts
EDIT    src/types.ts (isHand guard, handColor helper)
```

No `controllers.ts`.

## Decisions

- No controllers module — too thin, was just wrapping composition root work.
- Sabers is a module (not factory) — owns Map, lifecycle, disposal.
- Grip binding is event-driven, not polled. `source.grip` exists at connect time.
- `buildSaber` is a private helper, not exported. Module exposes `attach`/`detach`.
- Main.ts does the XR observable wiring + grip null check (boundary concern).
- When future steps need controller lookup by hand → extract controllers module then.
- `BladeSegment`/`SaberVisual` types added when trails/collision need them, not before.
