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

### Rhythm Grid (master)

All time-dependent modules derive from the rhythm grid. Grid is computed once, consumers read it.

```
createRhythmGrid(seed) → RhythmGrid

RhythmGrid {
    seed, steps: StepInfo[]    // flat list, 8 per bar, pre-computed
    totalBars, totalTime, structureName, sectionNames
    barStartTimes, barDurations, energyCurve, bpmCurve
}

StepInfo {
    time: Seconds
    barIndex: number
    energy: Energy
    bpm: BPM
}
```

No consumer recomputes step positions or energy lookups. All pre-resolved in the grid.

Consumers:
- Composer: reads grid timing/energy, places instruments on steps → events
- Stage: receives beat events from arena event queue for pulse
- Choreography: reads grid steps + energy for cue placement + difficulty scaling

### Music Pipeline

```
seed → createRhythmGrid(seed) → grid
grid → composeMusic(grid) → events only (no structural data)
grid + events → createMusicPlayer(grid, composition) → audio + currentTime()
```

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

Pipeline: seed → rhythm grid → composer (events) + choreography (cues) → music player + cubes.
Stage and choreography both consume the grid independently.
Cubes use music transport clock for timing (not frame dt).

### Arena Event Queue

Intra-arena communication via typed events + buffer-swap drain (same pattern as router CommandQueue).

Events: `beat` (fired when kick events pass in music clock), `songEnd` (fired after totalTime + tail).

Per-frame systems:
1. `beatSchedule.system` — checks music clock against kick times, emits beat events
2. `songEndDetector.system` — checks music clock against song end, emits songEnd
3. `arenaEventSystem` — drains arena queue, dispatches to stage.onBeat/cubes.onBeat/songEnd handling

Modules: stage, sabers, trails, cubes, choreography, collision, arena-events.
Per-frame systems: beatSchedule, songEndDetector, arenaEventDrain, beatDecay, trailUpdate, cubeMovement, collision.

See `plan-arena.md` for implementation details.

### Choreography — Cue Placement

Cues land on grid steps — every step has music playing (composer places instruments on the same grid). No cue at silence.

1. Base candidate pool: grid steps within the playable window (startOffset to totalTime - endOffset)
2. Difficulty controls density in both directions:
   - Easier: skip steps. Energy-modulated — low energy skips more, high energy keeps more. Not uniform.
   - Harder: interpolate between steps. Extra cues at midpoints between grid positions.
3. Choreography and stage both read the grid independently. Same data, different interpretation.

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
  │   ├── arena-events.ts    (arena event queue, beat schedule, song end detection)
  │   ├── stage.ts
  │   ├── saber.ts
  │   ├── trail.ts           (exclusive to saber)
  │   ├── cubes.ts           (cube pool, movement, beat flash)
  │   └── choreography.ts    (cue generation from grid)
  └── music/
      ├── songs.ts            (song catalog — shared)
      ├── rhythm-grid.ts      (master timing: seed → grid of StepInfo[])
      ├── music-composer.ts   (tonal, grid → events)
      └── music-player.ts     (tone, grid + events → audio)
```

## Shared Types (src/types.ts)

Domain aliases: Seed, Seconds, Hand, BPM, Energy
Gameplay: Difficulty (5 levels)
App: System, Teardown
Theme: Theme, handColor(), isHand()

Types live with their owners: RhythmGrid/StepInfo in rhythm-grid.ts, composition event types in music-composer.ts, Lane/Row/SwingDirection/Cue in choreography.ts, ArenaEvent in arena-events.ts.

## Archive

Previous docs moved to docs/archive/:
- architecture-drop-ecs.md
- architecture-music-gameplay.md
- plan-music-pipeline.md
- plan-cube-gameplay.md
- plan-menu.md
- plan-command-queue.md
