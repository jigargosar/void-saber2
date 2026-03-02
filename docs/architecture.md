Architecture

## Protocol

This doc is the high-level outline — contracts, boundaries, flow.
Detailed implementation lives in plan docs (e.g. `plan-lobby.md`, `plan-arena.md`).
When a plan doc doesn't exist yet, this doc holds minimal necessary details with a
TBD note. When a plan is written, details move there and this doc points to it.

## App Model

Two pages: **Lobby** and **Arena**. A router in main.ts swaps between them.
Each page is self-contained — owns its environment, UI, and systems.
Router constructs pages with arguments and handles transitions.

## Page Interface

```ts
interface Page {
    readonly systems: readonly System[]
    dispose: Teardown
}
```

Pages produce output signals for the router. Communication model TBD.

## Lobby Page

Menu environment + song selection UI.
User picks song and difficulty, triggers transition to Arena.

Internal details: no plan doc yet.

## Arena Page

Gameplay environment. Receives seed + difficulty from router.

Internal sub-states: playing, paused, results.
- playing — game active
- paused — everything visible, game logic frozen, overlay
- results — score display, retry or return to lobby

Internal state model TBD.

Internal details: no plan doc yet.

## Directory Structure

Top-level file = entry point. Same-named folder = internals.

```
src/
  ├── main.ts                (router)
  ├── types.ts               (shared types)
  ├── lobby-page.ts          (Lobby entry point)
  ├── lobby-page/            (Lobby internals)
  ├── arena-page.ts          (Arena entry point)
  ├── arena-page/            (Arena internals)
  ├── music.ts               (music pipeline entry point)
  ├── music/                 (music internals)
  └── xr-session.ts          (TBD — persistent XR layer)
```

## Shared Types (src/types.ts)

Domain aliases: Seed, Seconds, Hand
Gameplay: Difficulty, Lane, Row, SwingDirection
App: System, Teardown, Page
Theme: Theme, handColor(), isHand()

Music-specific types live in music/music-types.ts.

## Archive

Previous docs superseded by this one, moved to docs/archive/:
- architecture-music-gameplay.md
- plan-music-pipeline.md
- plan-cube-gameplay.md
- plan-menu.md
