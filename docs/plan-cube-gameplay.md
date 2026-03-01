Plan: Cube Gameplay (Workstream B)

## Goal

Cubes fly toward player down the corridor, player slices them with sabers,
score accumulates. Works with stub choreography initially, real choreography
when music pipeline (workstream A) is ready.

## Modules

### B1. choreography.ts

Two modes:
- `createStubChoreography()` — hardcoded test data for development
- `createChoreography(composition, beatTimeline, difficulty)` — real generation

**Stub choreography**: ~20 cubes spread over 30 seconds, covering all lanes,
rows, both hands, various directions. Fixed times at regular intervals.
Enough to test spawning, movement, collision, and scoring.

**Real choreography generation strategy**:
- Walk the beat timeline, decide per-beat whether to spawn a cube
- Energy curve drives probability: low energy = 20% chance, peak = 80%
- Difficulty multiplier: easy 0.5x, medium 1.0x, hard 1.5x density
- Kick events = guaranteed cube spawns (strong beats)
- Snare events = probable cube spawns at medium+ difficulty
- Hand assignment: alternate left/right by default
  - At high energy: occasional same-hand doubles
  - Respect lane positions (left lanes favor left hand, right favor right)
- Lane/row: seeded pseudo-random from composition seed
  - Avoid same lane twice in a row at low energy
  - Allow at high energy for speed patterns
- Direction: mostly down at easy, diagonal at medium, mixed at hard
  - Energy drives variety: low = simple downs, peak = all 8 directions
- Validation: no two cubes at exact same time + lane (prevent overlaps)
- Sort output by time ascending

### B2. cube-pool.ts

Pre-allocated mesh pool. Module pattern: `createCubePool(scene, theme, count)`.

**Mesh setup** (per cube):
- MeshBuilder.CreateBox — slightly rounded (fillet parameter)
- Two materials: theme.leftHand emissive, theme.rightHand emissive
- Arrow indicator on front face (direction arrow geometry or dynamic texture)
- Initially invisible (isVisible = false)

**Pool interface**:
```ts
interface ActiveCube {
    readonly mesh: Mesh
    readonly event: CubeEvent
    spawnTime: Seconds       // when it was spawned (playback time)
}

interface CubePool {
    spawn(event: CubeEvent, currentTime: Seconds): void
    readonly activeCubes: readonly ActiveCube[]
    readonly advanceSystem: System
    dispose: Teardown
}
```

- `spawn()`: acquire invisible mesh, set position from lane/row, set color from
  hand, set arrow rotation from direction, make visible
- `advanceSystem(dt)`: move all active cubes toward player (negative Z).
  Speed = CORRIDOR_LENGTH / TRAVEL_TIME. Cubes that pass the player (z > 0)
  are released back to pool (miss).

**Lane/row → world position mapping**:
```
Lane 0-3 → x: -0.6, -0.2, 0.2, 0.6  (spread across corridor width)
Row 0-2  → y:  0.8,  1.2, 1.6        (waist, chest, head height)
```
Spawn Z: far end of corridor (e.g. -20m).
Hit zone Z: player position (z ≈ 0).

### B3. Cube spawn system

Not a separate module — lives in main.ts wiring or as a system closure.

```ts
// Each frame, check if any upcoming cubes should spawn
function createSpawnSystem(
    choreography: Choreography,
    cubePool: CubePool,
    getPlaybackTime: () => Seconds,
): System
```

- Tracks a cursor index into choreography.cubes (sorted by time)
- Each frame: while next cube's time - currentTime < SPAWN_LEAD, spawn it
- SPAWN_LEAD ≈ 2.0 seconds (cubes visible approaching for ~2s)
- `getPlaybackTime()` from Tone.js transport position

### B4. Collision system

Saber blade segment vs cube AABB each frame.

**Saber segment**: need tip + base world positions (already computed in
`saber.ts` trailUpdateSystem). Expose these for collision:

```ts
// Add to Sabers interface:
getBladeSegment(hand: Hand): { tip: Vector3; base: Vector3 } | undefined
```

**Collision check**:
- For each active cube, test if either saber's blade segment intersects
  the cube's bounding box
- On intersection: check swing direction (saber velocity direction vs
  cube's required direction)
- Use dot product of saber movement vector vs expected direction vector
- Threshold: dot > 0.5 = correct swing

**On hit**: release cube from pool, increment score, trigger cut effect
**On miss direction**: release cube, count as miss (wrong swing)
**On pass**: cube goes past player z-threshold, release, count as miss

### B5. score.ts

Pure data accumulator.

```ts
interface ScoreState {
    hits: number
    misses: number
    streak: number
    maxStreak: number
}

interface ScoreTracker {
    readonly state: Readonly<ScoreState>
    hit(): void
    miss(): void
    reset(): void
}

function createScoreTracker(): ScoreTracker
```

- `hit()`: increment hits, streak, update maxStreak
- `miss()`: increment misses, reset streak to 0
- Exposed to HUD and results screen

### B6. Cut particles (later polish)

On successful hit: burst of mini-cubes matching cube color.
Particle system or manual mesh instances with gravity + fade.
Not critical for initial gameplay loop — add after core works.

## Saber.ts Changes

Expose blade world positions for collision. Currently computed in
trailUpdateSystem but not accessible outside:

```ts
// Add to Sabers interface:
getBladeSegment(hand: Hand): { tip: Vector3; base: Vector3 } | undefined

// Implementation: store tipWorld/baseWorld per hand after computing
// in trailUpdateSystem, return copies from getBladeSegment
```

## Stub Development Flow

1. Create stub choreography (hardcoded cubes)
2. Build cube pool + spawn system
3. See cubes flying toward you
4. Add collision detection
5. Add score tracking
6. Replace stub with real choreography when music pipeline ready

## Order

1. choreography.ts (stub first, real generation later)
2. cube-pool.ts (meshes, spawn, advance system)
3. Expose blade segment from saber.ts
4. Collision system
5. score.ts
6. Wire into main.ts
7. Typecheck + test

## Verification

1. `pnpm typecheck` passes
2. Stub cubes appear and travel down corridor
3. Cubes positioned correctly in lanes/rows
4. Saber collision detects hits
5. Wrong swing direction = miss
6. Cubes passing player = miss
7. Score increments correctly
8. Pool recycles meshes (no mesh leak)
