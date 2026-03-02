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

Router will own shared resources (MusicPlayer, song catalog) in the future. Not yet created.

## Page Interface

```ts
interface Page {
    readonly systems: readonly System[]
    dispose: Teardown
}
```

Pages produce output signals via single callback (e.g. `lobby.onPlay(cb)`, `arena.onReturnToLobby(cb)`). Bare signals, no payload. Router wires these to `navigate()` calls.

## Splash Page

Static visuals with pulse animation. No user interaction — exists solely to render while waiting for VR entry. Disposed by router when XR resolves.

## Music & Songs

Song catalog, MusicPlayer shape, and music preview — all TBD. See music/ for existing pipeline code.

## Lobby Page

Song selection UI. Receives XR session from router.
Hardcoded song list, no music preview. User picks song and difficulty, triggers transition to Arena.

Controllers render as glowing handles emitting a ray for menu interaction (laser pointer). Ray intersects GUI planes for selection. Handles + rays are lobby's own visuals — disposed on page exit, not shared with arena (arena uses sabers instead).

See `plan-lobby.md` for implementation details.

## Arena Page

Gameplay environment. Receives theme and XR session from router.

Internal sub-states: playing, paused, results.
- playing — game active
- paused — everything visible, game logic frozen, overlay
- results — score display (song name derived from seed), retry or return to lobby

Internal state model TBD.

See `plan-arena.md` for implementation details.

## XR Session

`xr-session.ts` — creates WebXR helper, resolves only when user enters VR. Returns `XRSession` handle with controllers map and `onSqueeze` for grip button events. Persistent across page transitions — both lobby and arena receive it. Lobby uses controllers for laser pointers, arena for sabers. Arena uses `onSqueeze` to return to lobby.

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
      ├── songs.ts            (song catalog — shared)
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
