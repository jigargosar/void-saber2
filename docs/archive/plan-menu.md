Plan: Menu + Game State (Workstream C)

## Goal

Full VR menu with song list, difficulty picker, high scores, settings.
Pause menu during gameplay. Results screen after song ends. Game state
machine drives transitions. Mock data where real integration isn't ready.

## Modules

### C1. game-state.ts

Discriminated union state machine. Pure logic, no rendering.

```ts
// Valid transitions:
//   menu → playing → paused → playing  (resume)
//   menu → playing → paused → menu     (quit)
//   menu → playing → paused → playing  (restart, via menu → playing)
//   menu → playing → results → menu    (song ended)
```

**State transitions enforce valid paths**:
- `startPlaying()` — only from menu
- `pause()` — only from playing
- `resume()` — only from paused
- `restart()` — only from paused (transitions to menu then immediately to playing)
- `showResults(score)` — only from playing
- `returnToMenu()` — from paused or results

Invalid transitions throw — fail fast, catch wiring bugs early.

**Phase change callbacks**: `onPhaseChange(callback)` returns Teardown.
Multiple listeners supported. Fires synchronously on transition.

### C2. menu.ts — Main Menu

Babylon.js GUI on a 3D plane (AdvancedDynamicTexture.CreateForMesh).

**VR positioning**:
- Plane: 2m wide × 1.5m tall
- Position: (0, 1.4, -3) — eye level, 3m in front of player
- Slight tilt toward player for readability

**Layout** (top to bottom):

```
+------------------------------------------+
|              VOID SABER                  |
|                                          |
|  [Song 1: Neon Pulse    ] [*]  Easy  [>] |
|  [Song 2: Dark Matter   ] [ ]  Med   [ ] |
|  [Song 3: Cyber Storm   ] [ ]  Hard  [ ] |
|  [Song 4: Void Walker   ] [ ]            |
|  [Song 5: Neural Drift  ] [ ]            |
|                                          |
|  High Score: 12,450    Streak: 42        |
|                                          |
|            [ PLAY ]                      |
+------------------------------------------+
```

**Components**:
- Title: "VOID SABER" header text
- Song list: 5 pre-defined seeds with display names
  - Seeds: hardcoded array of { seed: Seed, name: string }
  - Selected song highlighted
  - Scrollable if needed (but 5 fits on one panel)
- Difficulty selector: easy/medium/hard radio buttons
  - Default: medium
- High scores: per song + difficulty (mock initially, localStorage later)
- Play button: large, centered, prominent
- Settings panel (bottom or separate tab):
  - Master volume slider (mock — wires to MusicPlayer.masterGain later)
  - Trail toggle (mock)

**Interaction**:
- Laser pointer from XR controller (WebXR pointer selection re-enabled
  only for menu phase, disabled during gameplay)
- Or: gaze-based selection with dwell timer (simpler, works without controllers)
- Desktop: mouse click fallback
- Callbacks: `onPlay(seed, difficulty)` fires when Play pressed

**Song list** (pre-defined seeds):
```ts
const SONG_CATALOG = [
    { seed: 42,    name: 'Neon Pulse' },
    { seed: 1337,  name: 'Dark Matter' },
    { seed: 7890,  name: 'Cyber Storm' },
    { seed: 25000, name: 'Void Walker' },
    { seed: 55555, name: 'Neural Drift' },
] as const
```

Names are cosmetic — each seed deterministically produces a unique composition.

### C3. pause-menu.ts — In-Game Pause Overlay

Triggered by controller menu/B button during playing phase.

**VR positioning**: Same as main menu plane, appears in front of player.
Semi-transparent background dims the game world behind it.

**Layout**:
```
+---------------------------+
|          PAUSED           |
|                           |
|      [ Continue ]         |
|      [ Restart  ]         |
|      [ Quit     ]         |
+---------------------------+
```

**Components**:
- "PAUSED" title
- Continue button — resumes gameplay + music
- Restart button — restarts same song from beginning
- Quit button — returns to main menu

**Behavior**:
- Show: freezes game (cubes stop, music pauses via player.stop())
- Continue: hides overlay, resumes music + cubes
- Restart: disposes current player, recomposes same seed, starts fresh
- Quit: disposes current player, shows main menu

### C4. results.ts — Results Screen

Shown when song completes (all cubes passed or song timer ends).

**VR positioning**: Same plane position as menu.

**Layout**:
```
+------------------------------------------+
|            SONG COMPLETE                 |
|                                          |
|  Song: Neon Pulse                        |
|  Difficulty: Medium                      |
|                                          |
|  Score:    12,450                         |
|  Accuracy: 87%                           |
|  Max Streak: 42                          |
|                                          |
|  Rank: A                                 |
|                                          |
|      [ Retry ]     [ Menu ]              |
+------------------------------------------+
```

**Components**:
- Song name + difficulty
- Score, accuracy (hits / total), max streak
- Rank: S (95%+), A (85%+), B (75%+), C (65%+), D (below)
- Retry button — same song + difficulty
- Menu button — back to song selection

**Accuracy calculation**: hits / (hits + misses) × 100

### C5. Babylon.js GUI Approach

All UI uses `@babylonjs/gui` (AdvancedDynamicTexture on mesh planes):

```ts
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture'
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock'
import { Button } from '@babylonjs/gui/2D/controls/button'
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel'
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle'
```

- One mesh plane per screen (menu, pause, results)
- Show/hide by toggling mesh.isVisible
- GUI controls attached to the texture
- Color scheme: dark purple/blue matching corridor theme
- Text: monospace font, neon colors matching theme

### C6. XR Interaction

**Menu phase**: re-enable XR pointer selection for GUI interaction
**Playing phase**: disable pointer selection (sabers replace pointers)
**Paused/results phase**: re-enable pointer selection

This means `setupXR` needs a way to toggle pointer selection:
```ts
// Expose pointer feature toggle from setupXR
interface XRControls {
    enablePointerSelection(): void
    disablePointerSelection(): void
}
```

Or: game state change callback toggles the feature.

## Mock Data

Until workstream A (music) and B (cubes) are ready:
- Song names: from SONG_CATALOG (hardcoded)
- High scores: `{ score: 0, streak: 0 }` per song/difficulty (mock)
- Results screen: accepts any Score object (can test with fake data)
- Play button: fires onPlay callback (consumer decides what happens)

## Order

1. game-state.ts (state machine, transitions, callbacks)
2. menu.ts (main menu panel, song list, difficulty, play button)
3. pause-menu.ts (pause overlay, three buttons)
4. results.ts (score display, retry/menu)
5. Wire into main.ts (state transitions drive show/hide)
6. Typecheck + test

## Verification

1. `pnpm typecheck` passes
2. Menu visible on app start (positioned correctly in VR)
3. Song list: select different songs
4. Difficulty: select easy/medium/hard
5. Play button fires callback with correct seed + difficulty
6. During gameplay: pause button shows overlay
7. Pause menu: continue resumes, restart replays, quit returns to menu
8. Results: shows score, retry replays, menu returns
9. Invalid state transitions throw errors in console
10. Desktop: mouse click works on all buttons
