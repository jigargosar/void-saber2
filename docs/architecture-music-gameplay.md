Architecture: Music + Gameplay + Menu Pipelines

## Context

Steps 1-5 done (corridor, XR, controllers, sabers, trails). Three parallel workstreams
to build next: music pipeline, cube gameplay, and VR menu. This doc defines the shared
type contracts and each workstream's scope so they can proceed independently.

Reference: `docs/reference/music_gen_v2.html` (song generation + Tone.js playback).
Dependencies: tone 15.1.22, tonal 6.4.3 (both installed).

---

## Shared Type Contracts (src/types.ts)

These types are the boundaries between workstreams. Define first, all three depend on them.

```ts
// New domain aliases
type Seed = number
type BPM = number
type Energy = number              // 0-1, drives density/intensity
type Difficulty = 'easy' | 'medium' | 'hard'
type Lane = 0 | 1 | 2 | 3        // columns left to right
type Row = 0 | 1 | 2             // rows bottom to top
type SwingDirection = 'up' | 'down' | 'left' | 'right'
                    | 'upleft' | 'upright' | 'downleft' | 'downright'
                    | 'any'

// Game state — menu → playing ⇄ paused → results → menu
type GamePhase = 'menu' | 'playing' | 'paused' | 'results'
```

Cross-module data types (exported from their owning modules):
- `MusicComposition` — from music-composer.ts
- `BeatTimeline` — from beat-timeline.ts
- `Choreography`, `CubeEvent` — from choreography.ts
- `MusicPlayer` — from music-player.ts
- `GameState` — from game-state.ts

---

## Parallel Workstream A: Music Pipeline

Goal: seed → full procedural song plays with 7 instruments, stage pulses on beats.

### A1. music-composer.ts

Port from reference generateSong() (lines 339-558). Pure data, uses tonal.

```ts
interface NoteEvent {
    readonly time: Seconds
    readonly note: NoteName
    readonly duration: Seconds
    readonly vel: Velocity
}

interface ChordEvent {
    readonly time: Seconds
    readonly notes: readonly NoteName[]
    readonly duration: Seconds
    readonly vel: Velocity
}

interface DrumEvent {
    readonly time: Seconds
    readonly vel: Velocity
}

interface BarData {
    readonly bar: number
    readonly section: string
    readonly energy: Energy
    readonly bpm: BPM
    readonly chordSymbol: string
    readonly numeral: string
    readonly voiced: readonly string[]
}

interface MusicComposition {
    readonly seed: Seed
    readonly tonic: string
    readonly structureName: string
    readonly orderingName: string
    readonly totalBars: number
    readonly totalTime: Seconds
    readonly bars: readonly BarData[]
    readonly energyCurve: readonly Energy[]
    readonly bpmCurve: readonly BPM[]
    readonly barStartTimes: readonly Seconds[]
    readonly barDurations: readonly Seconds[]
    readonly padEvents: readonly ChordEvent[]
    readonly bassEvents: readonly NoteEvent[]
    readonly kickEvents: readonly DrumEvent[]
    readonly snareEvents: readonly DrumEvent[]
    readonly hatEvents: readonly DrumEvent[]
    readonly arpEvents: readonly NoteEvent[]
    readonly melodyEvents: readonly NoteEvent[]
}

function composeMusic(seed: Seed): MusicComposition
```

Internals (all from reference, not exported):
- Seeded RNG (deterministic)
- 5 song structures, Markov chord progressions (minor key)
- Voice leading (minimal movement, tonal VoicingDictionary.triads)
- Energy curve (3-pass smoothing + noise), per-section BPM (112-144)
- Sigmoid instrument activation (7 instruments, 5 orderings)
- Drum/arp/melody pattern generators

tonal imports: Note, Scale, Progression, Voicing, VoiceLeading, VoicingDictionary

### A2. beat-timeline.ts

```ts
interface BeatTimeline {
    readonly beatTimes: readonly Seconds[]   // every quarter note
    readonly totalBeats: number
    readonly totalTime: Seconds
}

function extractBeatTimeline(composition: MusicComposition): BeatTimeline
```

Logic: each bar = 4 beats, beatDuration = barDurations[i] / 4.

### A3. music-player.ts

```ts
interface MusicPlayer {
    start(): Promise<void>
    stop(): void
    dispose: Teardown
}

function createMusicPlayer(
    composition: MusicComposition,
    onBeat: () => void,
): MusicPlayer
```

7 instruments with effect chains (from reference lines 647-709):

  Pad:    PolySynth(Synth, fatsawtooth) → Chorus → Filter(LP 1200) → Reverb(3s) → master
  Bass:   MonoSynth(saw) → Filter(LP 800, -12) → master
  Kick:   MembraneSynth → master
  Snare:  NoiseSynth(white) → Filter(HP 1200) → master
  Hat:    NoiseSynth(white) → Filter(HP 8000) → master
  Arp:    PolySynth(Synth, square) → Filter(LP 3000) → Reverb(1s) → master
  Melody: Synth(saw) → Filter(LP 2200) → Reverb(1.5s) → master
  Master: Gain(1) → getDestination()

Scheduling: Tone.Part per instrument, onBeat on kicks via Tone.getDraw().schedule().
Master fade on last bar. Transport start/stop/cancel.

### A4. Wire main.ts

- Compose, extract timeline, create player
- onBeat → stage.onBeat()
- Start on canvas click
- Remove keyboard test triggers, delete audio.ts

### A: Verification

1. pnpm typecheck
2. pnpm dev → click → full song plays, all 7 instruments
3. Stage pulses on kicks
4. Different seeds = different songs
5. Clean fade-out and stop

### A: Files

```
EDIT    src/types.ts           (add Seed, BPM, Energy)
CREATE  src/music-composer.ts
CREATE  src/beat-timeline.ts
CREATE  src/music-player.ts
EDIT    src/main.ts            (wire music, remove keyboard triggers)
DELETE  src/audio.ts           (replaced by music-player.ts)
```

---

## Parallel Workstream B: Cube Gameplay

Goal: cubes fly toward player, slice them with sabers, score points.
Can start with stub choreography (hardcoded CubeEvents) before workstream A finishes.

### B1. choreography.ts

```ts
interface CubeEvent {
    readonly time: Seconds
    readonly lane: Lane
    readonly row: Row
    readonly hand: Hand
    readonly direction: SwingDirection
}

interface Choreography {
    readonly cubes: readonly CubeEvent[]
    readonly totalTime: Seconds
}

function createChoreography(
    composition: MusicComposition,
    beatTimeline: BeatTimeline,
    difficulty: Difficulty,
): Choreography
```

Generation strategy:
- Energy curve drives density: low = sparse, peak = dense
- Difficulty scales: easy (quarter beats), medium (+ off-beats), hard (+ 8ths, combos)
- Cubes land on kick/snare hits (strong beats = cubes)
- Hand: alternating default, same-hand doubles at high energy
- Lane/row: seeded pseudo-random, no impossible patterns
- Direction: mostly down/diagonal, varies with energy
- No two cubes at same time+lane

Stub for early development:
```ts
function createStubChoreography(): Choreography
// Hardcoded ~20 cubes, fixed times, covers all lanes/rows/directions
```

### B2. cube-pool.ts

```ts
interface CubePool {
    acquire(): Mesh | undefined
    release(mesh: Mesh): void
    readonly advanceSystem: System    // moves active cubes toward player
    dispose: Teardown
}

function createCubePool(scene: Scene, count: number): CubePool
```

- Pre-create N rounded cubes (MeshBuilder.CreateBox with edgesWidth)
- Directional arrow on face (texture or geometry)
- Color by hand (theme.leftHand / theme.rightHand)
- Acquire sets visible + positions at spawn point
- Release hides + resets
- advanceSystem moves active cubes toward player at fixed speed each frame

### B3. Cube spawn system

Reads Choreography, compares current playback time vs cube times.
Spawns cubes SPAWN_LEAD seconds ahead (cubes visible approaching).
Acquires from pool, sets lane/row/direction/color.

### B4. Collision system

Saber segment vs cube AABB. Check swing direction matches CubeEvent.direction.
On hit: release cube, trigger cut particles, update score.
On miss (cube passes player): release cube, update score.

### B5. Score

```ts
interface Score {
    readonly hits: number
    readonly misses: number
    readonly streak: number
    readonly maxStreak: number
    readonly total: number
}
```

Pure data accumulator. Exposed to HUD and results screen.

### B: Verification

1. pnpm typecheck
2. Stub choreography: cubes appear, travel toward player
3. Saber collision: cubes disappear on hit
4. Direction check: wrong swing = miss
5. Score accumulates

### B: Files

```
EDIT    src/types.ts           (add Difficulty, Lane, Row, SwingDirection)
CREATE  src/choreography.ts
CREATE  src/cube-pool.ts
EDIT    src/saber.ts           (expose blade segment for collision)
EDIT    src/main.ts            (wire cube systems)
```

---

## Parallel Workstream C: Menu + Game State

Goal: full VR menu with song list, difficulty picker, high scores, settings.
Mock data where real integration isn't ready. Real integration where possible.

### C1. game-state.ts

```ts
type GamePhase = 'menu' | 'playing' | 'paused' | 'results'

interface GameState {
    readonly phase: GamePhase
    readonly selectedSeed: Seed | null
    readonly difficulty: Difficulty
    readonly score: Score | null
}

interface GameStateManager {
    readonly state: GameState
    selectSong(seed: Seed): void
    setDifficulty(difficulty: Difficulty): void
    startPlaying(): void
    pause(): void
    resume(): void
    restart(): void
    showResults(score: Score): void
    returnToMenu(): void
    onPhaseChange(callback: (phase: GamePhase) => void): Teardown
    dispose: Teardown
}

function createGameStateManager(): GameStateManager
```

Validates transitions: menu→playing⇄paused→results→menu.
No countdown phase — song intro sections serve as natural lead-in.
Invalid transitions throw (fail fast).

### C2. menu.ts — VR Menu Panel

```ts
interface Menu {
    show(): void
    hide(): void
    onPlay(callback: (seed: Seed, difficulty: Difficulty) => void): Teardown
    dispose: Teardown
}

function createMenu(scene: Scene): Menu
```

Full visual menu:
- Song list (seed-based, 5 pre-defined seeds with names)
- Difficulty selector (easy/medium/hard)
- High scores per song (mock data initially, localStorage later)
- Settings panel (volume, trail toggle — mock)
- Play button
- Laser pointer interaction from controller

Babylon.js GUI (AdvancedDynamicTexture on a plane in 3D space).
Positioned in front of player at menu phase.

### C3. pause-menu.ts — In-Game Pause Overlay

```ts
interface PauseMenu {
    show(): void
    hide(): void
    onContinue(callback: () => void): Teardown
    onRestart(callback: () => void): Teardown
    onQuit(callback: () => void): Teardown
    dispose: Teardown
}

function createPauseMenu(scene: Scene): PauseMenu
```

Overlay during paused phase. Three options: continue, restart song, back to menu.
Triggered by controller button (menu/B button).

### C4. results.ts

```ts
interface Results {
    show(score: Score): void
    hide(): void
    onRetry(callback: () => void): Teardown
    onMenu(callback: () => void): Teardown
    dispose: Teardown
}

function createResults(scene: Scene): Results
```

Score display, accuracy %, streak. Retry and Menu buttons with laser interaction.

### C: Verification

1. pnpm typecheck
2. Menu appears on start, shows song list + difficulty
3. Laser pointer selects items
4. Play → playing → pause → continue/restart/quit → results → menu loop
5. State transitions enforce valid paths

### C: Files

```
EDIT    src/types.ts         (add GamePhase)
CREATE  src/game-state.ts
CREATE  src/menu.ts
CREATE  src/pause-menu.ts
CREATE  src/results.ts
EDIT    src/main.ts          (wire state manager, menu, pause-menu, results)
```

---

## Integration Points

When workstreams merge in main.ts:

```ts
function main(): void {
    const { engine, scene } = setupEngine()
    const stage = createStage(scene, theme)
    const sabers = createSabers(scene, theme)

    const gameState = createGameStateManager()
    const menu = createMenu(scene)
    const pauseMenu = createPauseMenu(scene)
    const results = createResults(scene)

    // Menu → playing: compose + start (song intro = natural lead-in)
    menu.onPlay((seed, difficulty) => {
        const composition = composeMusic(seed)
        const beatTimeline = extractBeatTimeline(composition)
        const player = createMusicPlayer(composition, () => stage.onBeat())
        const choreography = createChoreography(composition, beatTimeline, difficulty)

        gameState.startPlaying()
        menu.hide()
        player.start().catch(console.error)
        // activate cube spawn system with choreography
    })

    // Pause menu actions
    pauseMenu.onContinue(() => { gameState.resume(); pauseMenu.hide() })
    pauseMenu.onRestart(() => { gameState.restart(); pauseMenu.hide(); /* recompose + replay */ })
    pauseMenu.onQuit(() => { gameState.returnToMenu(); pauseMenu.hide(); menu.show() })

    // Results → menu or retry
    results.onMenu(() => { gameState.returnToMenu(); menu.show() })
    results.onRetry(() => { /* recompose + replay */ })

    setupXR(scene, sabers).catch(console.error)

    startGameLoop(scene, [
        stage.beatDecaySystem,
        sabers.trailUpdateSystem,
        // cubePool.advanceSystem,
        // collisionSystem,
    ])

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}
```

---

## Parallel Start Order

All three can start immediately once shared types are in src/types.ts.

```
Shared types (10 min) ──→ A: Music pipeline (independent)
                     ──→ B: Cube gameplay (stub choreography)
                     ──→ C: Menu + state (mock data)
```

B uses createStubChoreography() until A delivers real MusicComposition.
C uses mock song list until A delivers composeMusic().
Integration happens when all three merge into main.ts.
