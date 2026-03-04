Plan: Arena Page

## Goal

Hardcoded gameplay loop: music plays, cubes spawn on beat, sabers cut cubes.
Song ends, auto-return to lobby. No results screen, no pause menu, no scoring display.

## Dependencies (from router)

Arena receives from router (see architecture.md):
- scene
- theme
- xrSession — controllers for sabers

Arena emits: onReturnToLobby → router navigates to lobby.

## What Exists

- stage.ts — corridor environment (pillars, fog, lights)
- saber.ts — blades attached to controller grips
- trail.ts — ribbon trail behind saber tips
- Squeeze grip / Escape key → return to lobby

## What Needs Building

Steps 7-13 from BUILD-GUIDE, wired with hardcoded seed and difficulty.

### Music Wiring

On arena create:
1. `composeMusic(HARDCODED_SEED)` → MusicComposition
2. `extractBeatTimeline(composition)` → BeatTimeline
3. `createMusicPlayer(composition, onBeat)` → MusicPlayer
4. `createChoreography(composition, timeline, HARDCODED_DIFFICULTY)` → Choreography
5. `musicPlayer.start()` — begins playback

On song end: fire onReturnToLobby (auto-return, no user action).

### Choreography (step 10)

`createChoreography(composition, beatTimeline, config)` → Choreography (list of cues).

Each cue:
- beatTime — when the cube must arrive at the hit zone
- lane (0-3) — column position
- row (0-2) — height position
- hand — left or right (determines color)
- swingDirection — required swing to hit

Config: `{ difficulty, startOffset, endOffset }`
- startOffset — no cues before this time (cube travel duration)
- endOffset — no cues after totalTime - endOffset

#### Cue placement — music-event-driven

Cues must land on real music events. A cue at silence feels arbitrary.

1. Collect all music event times (kick, snare, hat, bass, arp, melody, pad) as candidate pool
2. Difficulty subtracts or adds:
   - Easier: skip candidates — not uniformly, energy-modulated (low energy skips more, high energy keeps more)
   - Harder: interpolate between events (e.g. midpoint between kick at 2.0s and snare at 2.25s → extra cue at 2.125s)
3. Energy curve modulates density in both directions

The base pool is always real music events. Difficulty stretches it both ways.

### Cube Pool (step 11)

Pre-allocated pool of cube meshes. Cubes activate from pool, travel toward player,
arrive at hit zone on beat time.

- Spawn at far z, travel at constant speed toward player
- Spawn time = beatTime - travelDuration
- Color from theme (left=cyan, right=pink)
- On hit or miss (passed player): return to pool

### Directional Arrows (step 12)

Arrow on cube face showing required swing direction.
Texture or geometry on the front face of each cube.

### Collision (step 13)

Per frame: check saber blade against each active cube.
- Intersection: bounding sphere or box overlap
- Direction check: saber velocity direction vs required swingDirection
- Hit: deactivate cube, return to pool
- Miss: cube passes player, return to pool

## Modules

```
arena-page/
  arena-page.ts    — page entry, wires music + cubes + sabers
  stage.ts         — corridor environment (exists)
  saber.ts         — sabers (exists)
  trail.ts         — trails (exists, exclusive to saber)
  choreography.ts  — cue schedule from composition + timeline + difficulty
  cube-pool.ts     — pooled cubes, spawning, movement, deactivation
  collision.ts     — saber vs cube intersection + direction check
```

## Systems (per frame)

- stage.beatDecaySystem (exists)
- sabers.trailUpdateSystem (exists)
- cubeMovementSystem — advance active cubes, spawn new ones when due, deactivate missed
- collisionSystem — saber vs cube checks

## Flow

```
arena create
  → compose(seed) → timeline → choreography → musicPlayer
  → musicPlayer.start()
  → render loop: move cubes, check collisions, spawn on schedule
  → song ends → onReturnToLobby fires
  → dispose: stop music, return all cubes to pool, cleanup
```
