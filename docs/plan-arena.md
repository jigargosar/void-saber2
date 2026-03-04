Plan: Arena Page

## Goal

Hardcoded gameplay loop: music plays, cubes spawn on beat, sabers cut cubes.
Song ends, auto-return to lobby. No results screen, no pause menu, no scoring display.

## Dependencies (from router)

Arena receives from router (see architecture.md):
- scene
- theme
- xrSession — controllers for sabers
- seed — determines music + choreography
- queue — CommandQueue for cross-page events

Arena emits: `arenaSessionCompleted` via queue → router navigates to lobby.

## What Exists (all implemented)

- stage.ts — corridor environment (pillars, fog, lights, beat pulse)
- saber.ts — blades attached to controller grips, forEachBlade() for collision
- trail.ts — ribbon trail behind saber tips
- cubes.ts — pooled cubes, spawning, movement, beat flash, forEachActive()
- choreography.ts — cue generation from grid steps + energy + difficulty
- arena-events.ts — arena event queue, beat schedule, song end detection
- Escape key → return to lobby
- Collision: segment-to-sphere in arena-page.ts

## Pipeline

```
arena create
  → createRhythmGrid(seed) → grid
  → composeMusic(grid) → composition (events only)
  → createMusicPlayer(grid, composition) → audio + currentTime()
  → createChoreography(grid, config) → cues
  → createCubes(scene, theme, currentTime, cues)
  → arena event queue: beat schedule + song end detection
  → musicPlayer.start()
  → render loop: beat events → stage/cubes, move cubes, check collisions
  → songEnd event → stop music, enqueue arenaSessionCompleted
  → dispose: stop music, return all cubes to pool, cleanup
```

## Modules

```
arena-page/
  arena-page.ts    — page entry, wires everything
  arena-events.ts  — arena event queue, beat schedule, song end detection
  stage.ts         — corridor environment
  saber.ts         — sabers
  trail.ts         — trails (exclusive to saber)
  cubes.ts         — pooled cubes, spawning, movement, beat flash
  choreography.ts  — cue schedule from grid + difficulty
```

## Systems (per frame, in order)

1. beatSchedule.system — checks music clock vs kick times, emits beat events
2. songEndDetector.system — checks music clock vs song end, emits songEnd
3. arenaEventSystem — drains arena queue, dispatches to handlers
4. stage.beatDecaySystem — decay fog/pillar pulse
5. sabers.trailUpdateSystem — update ribbon trails
6. cubes.system — spawn due cubes, move active cubes, deactivate missed
7. collisionSystem — saber vs cube checks

## Cue Details

Each cue:
- beatTime — when the cube must arrive at the hit zone
- lane (0-3) — column position
- row (0-2) — height position
- hand — left or right (determines color)
- swingDirection — required swing to hit

Config: `{ difficulty, startOffset, endOffset }`
- startOffset — no cues before this time (cube travel duration)
- endOffset — no cues after totalTime - endOffset

Cue placement — grid-step-driven. See architecture.md "Choreography — Cue Placement".

## Remaining Work

### Directional Arrows (step 12)
Arrow on cube face showing required swing direction.
Texture or geometry on the front face of each cube.

### Direction-based collision
Currently collision only checks proximity (segment-to-sphere).
Need to also verify saber velocity direction vs required swingDirection.
