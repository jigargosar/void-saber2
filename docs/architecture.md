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

Router owns shared resources that outlive any single page: MusicPlayer and song catalog. Both are created once and passed down to whichever page needs them.

## Page Interface

```ts
interface Page {
    readonly systems: readonly System[]
    dispose: Teardown
}
```

Pages produce output signals via callback registration (e.g. `lobby.onPlay(selection)`, `arena.onReturnToLobby()`). Router wires these to `navigate()` calls.

Route to arena carries song seed + difficulty. Return to lobby carries nothing.

## Splash Page

Static visuals with pulse animation. No user interaction — exists solely to render while waiting for VR entry. Disposed by router when XR resolves.

## Music & Songs

Song catalog lives in `music/songs.ts` — a static list of `{ name, seed }` entries. Shared by both pages.

MusicPlayer is created once by the router and passed to both pages. Lobby uses it for song preview (play/stop as user browses). Arena uses it for full gameplay playback with beat callbacks.

MusicPlayer must support swapping compositions without recreate — Tone.js instruments are the same for every song, only the composition data changes.

## Lobby Page

Music browser + song selection UI. Receives XR session, MusicPlayer + song catalog from router.
User browses songs (preview plays on select), picks difficulty, triggers transition to Arena with seed + difficulty.

Controllers render as glowing handles emitting a ray for menu interaction (laser pointer). Ray intersects GUI planes for selection. Handles + rays are lobby's own visuals — disposed on page exit, not shared with arena (arena uses sabers instead).

Internal details: no plan doc yet.

## Arena Page

Gameplay environment. Receives theme, XR session, MusicPlayer, seed, and difficulty from router.

Internal sub-states: playing, paused, results.
- playing — game active
- paused — everything visible, game logic frozen, overlay
- results — score display (song name derived from seed), retry or return to lobby

Internal state model TBD.

Internal details: no plan doc yet.

## XR Session

`xr-session.ts` — creates WebXR helper, resolves only when user enters VR. Returns `XRSession` handle with controllers map and add/remove callbacks. Persistent across page transitions — both lobby and arena receive it. Lobby uses controllers for laser pointers, arena for sabers.

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
