Architecture

## Protocol

This doc is the high-level outline — contracts, boundaries, flow.
Detailed implementation lives in plan docs (e.g. `plan-lobby.md`, `plan-arena.md`).
When a plan doc doesn't exist yet, this doc holds minimal necessary details with a
TBD note. When a plan is written, details move there and this doc points to it.

## App Model

Three phases: **Splash → Lobby ↔ Arena**. A sync router in main.ts manages all page lifecycle.

Boot: splash renders while "Enter VR" button is visible. `createXRSession` resolves only after user enters VR (non-null guarantee). Splash disposes, router navigates to lobby.

Router owns a CommandQueue. Pages receive the queue and enqueue domain events. Router drains the queue once per frame (before running systems) and handles each command via exhaustive switch.

Commands: `songSelected` (carries seed), `arenaSessionCompleted`.

Router will own shared MusicPlayer in the future. Song catalog lives in `music/songs.ts`.

## Page Interface

```ts
interface Page {
    readonly systems: readonly System[]
    dispose: Teardown
}
```

Pages receive a CommandQueue and enqueue domain events. No callbacks between pages and router — all cross-page communication goes through the queue.

## Splash Page

Static visuals with pulse animation. No user interaction — exists solely to render while waiting for VR entry. Disposed by router when XR resolves.

## Music & Songs

Song catalog in `music/songs.ts` — `Song` type with seed + name. Shared across lobby and arena.

Music pipeline: `composeMusic(seed)` → `MusicComposition` → `createMusicPlayer(composition, onBeat, queue)` → `MusicPlayer`. Player enqueues `arenaSessionCompleted` when song ends. Beat callback stays direct (not queued) — `getDraw().schedule` already defers to rAF.

MusicPlayer sharing and music preview — TBD.

## Lobby Page

Song selection UI. Receives scene and command queue from router.
Two-panel menu: song list (left), details + difficulty + play (right).
Babylon.js GUI on 3D planes. Difficulty is lobby-only state (5 levels).
Play button enqueues `songSelected` with seed.

VR laser pointer interaction — TBD. Currently mouse/click only.

See `plan-lobby.md` for implementation details.

## Arena Page

Gameplay environment. Receives scene, theme, XR session, seed, and command queue from router.

Composes music from seed, creates music player, starts playback.
Stage + sabers + trails are per-frame systems.
Escape key and song end both enqueue `arenaSessionCompleted`.

Choreography, cube pool, collision — not yet implemented.

See `plan-arena.md` for implementation details.

## XR Session

`xr-session.ts` — creates WebXR helper, resolves only when user enters VR. Returns `XRSession` handle with controllers map and dispose. Persistent across page transitions — arena uses controllers for sabers. Lobby will use controllers for laser pointers (TBD).

## Command Queue

`command-queue.ts` — typed command union + buffer-swap drain. Router creates the queue, passes it to pages. Pages enqueue, router drains once per frame before running systems. Buffer swap in drain prevents infinite loops (commands enqueued during handling go to next frame).

See `docs/archive/plan-command-queue.md` for design rationale.

## Directory Structure

Page directories group modules by ownership. Shared files stay in `src/`.
No cross-page imports — lobby-page/, arena-page/, and music/ can develop in parallel.
Coupling points: router in main.ts, command queue passed to pages.

```
src/
  ├── main.ts                (engine, render loop, router, command handling)
  ├── types.ts               (shared domain types)
  ├── command-queue.ts       (command union + queue primitive)
  ├── xr-session.ts          (XR session — persistent, required)
  ├── splash-page/
  │   └── splash.ts
  ├── lobby-page/
  │   ├── lobby-page.ts      (page entry point)
  │   ├── lobby-env.ts       (3D environment)
  │   └── menu.ts            (song list + difficulty + play)
  ├── arena-page/
  │   ├── arena-page.ts      (page entry point)
  │   ├── stage.ts
  │   ├── saber.ts
  │   └── trail.ts           (exclusive to saber)
  └── music/
      ├── music-types.ts
      ├── songs.ts            (song catalog — shared)
      ├── music-composer.ts   (tonal)
      ├── music-player.ts     (tone)
      ├── beat-timeline.ts
      └── audio.ts            (old, being replaced by music-player)
```

## Shared Types (src/types.ts)

Domain aliases: Seed, Seconds, Hand
Gameplay: Difficulty (5 levels), Lane, Row, SwingDirection
App: System, Teardown
Theme: Theme, handColor(), isHand()

Music-specific types live in music/music-types.ts.

## Archive

Previous docs moved to docs/archive/:
- architecture-drop-ecs.md
- architecture-music-gameplay.md
- plan-music-pipeline.md
- plan-cube-gameplay.md
- plan-menu.md
- plan-command-queue.md
