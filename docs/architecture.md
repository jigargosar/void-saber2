Architecture

## Protocol

This doc is the high-level outline — contracts, boundaries, flow.
Detailed implementation lives in plan docs (e.g. `plan-lobby.md`, `plan-arena.md`).
When a plan doc doesn't exist yet, this doc holds minimal necessary details with a
TBD note. When a plan is written, details move there and this doc points to it.

## App Model

Three phases: **Splash → Lobby ↔ Arena**. A sync router in main.ts manages all page lifecycle.

Boot: splash renders while "Enter VR" button is visible. `createXRSession` resolves only after user enters VR (non-null guarantee). Splash disposes, router navigates to lobby.

Page switching uses a `navigate(route)` switch — pages emit events, routing logic lives in one place. Render loop calls `router.activeSystems()` every frame.

## Page Interface

```ts
interface Page {
    readonly systems: readonly System[]
    dispose: Teardown
}
```

Pages produce output signals via callback registration (e.g. `lobby.onPlay()`, `arena.onReturnToLobby()`). Router wires these to `navigate()` calls.

## Splash Page

Static visuals with pulse animation. No user interaction — exists solely to render while waiting for VR entry. Disposed by router when XR resolves.

## Lobby Page

Menu environment + song selection UI.
User picks song and difficulty, triggers transition to Arena.

Internal details: no plan doc yet.

## Arena Page

Gameplay environment. Receives theme + XR session from router.

Internal sub-states: playing, paused, results.
- playing — game active
- paused — everything visible, game logic frozen, overlay
- results — score display, retry or return to lobby

Internal state model TBD.

Internal details: no plan doc yet.

## XR Session

`xr-session.ts` — creates WebXR helper, resolves only when user enters VR. Returns `XRSession` handle with controllers map and add/remove callbacks. Persistent across page transitions — arena receives it, lobby doesn't need it.

## Directory Structure

Page directories group modules by ownership. Shared files stay in `src/`.
No cross-page imports — lobby-page/, arena-page/, and music/ can develop in parallel.
Only coupling point is the router's navigate(route) switch in main.ts.

```
src/
  ├── main.ts                (engine, render loop, router)
  ├── types.ts               (shared domain types)
  ├── xr-session.ts          (XR session — persistent, required)
  ├── game-state.ts          (state machine — not yet wired)
  ├── splash-page/
  │   └── splash.ts
  ├── lobby-page/
  │   ├── lobby-page.ts      (page entry point)
  │   └── menu.ts
  ├── arena-page/
  │   ├── arena-page.ts      (page entry point)
  │   ├── stage.ts
  │   ├── saber.ts
  │   └── trail.ts           (exclusive to saber)
  └── music/
      ├── music-types.ts
      ├── music-composer.ts   (tonal)
      ├── music-player.ts    (tone)
      ├── beat-timeline.ts
      └── audio.ts           (old, being replaced by music-player)
```

## Shared Types (src/types.ts)

Domain aliases: Seed, Seconds, Hand
Gameplay: Difficulty, Lane, Row, SwingDirection
App: System, Teardown
Theme: Theme, handColor(), isHand()

Music-specific types live in music/music-types.ts.

## Archive

Previous docs superseded by this one, moved to docs/archive/:
- architecture-drop-ecs.md
- architecture-music-gameplay.md
- plan-music-pipeline.md
- plan-cube-gameplay.md
- plan-menu.md
