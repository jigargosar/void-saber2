Plan: Lobby Page

## Goal

Beat Saber-style VR lobby. Dark neon environment, multi-region song browser UI,
VR controller handles with laser pointers for interaction.

Reference: docs/reference/lobby-screen.webp

## Dependencies (from router)

Lobby receives from router (see architecture.md):
- scene
- xrSession — controllers for pointer handles

Lobby emits: onPlay(seed, difficulty) → router navigates to arena.

## Scope

Lobby visuals + interaction. Song catalog lives in music/songs.ts (shared).
Pointer handles + rays are lobby-internal (disposed on page exit).

## Environment

Dark atmospheric space:
- Near-black background with subtle blue/teal tint
- Floor surface (very dark, barely visible) with rectangular glowing wireframe border
- Fog/haze for depth
- Distant light bloom at top of scene
- Slow-drifting blue particles moving across the scene
- Glow layer for platform border and UI panel emissives

UI panels are the visual focus. Environment is subtle mood lighting.

Detailed lighting analysis: docs/reference/lobby-env-analysis.md

## UI Layout (5 regions)

All regions are Babylon.js GUI textures on 3D planes, positioned in front of
the player at eye height. Layout mirrors Beat Saber's lobby (see reference).

### Region 1: Top bar

Top center. Mode label ("SOLO") at top. Back arrow navigates to pre-lobby
screen (mode select) — we don't have this screen yet but include the arrow
for perfect replica. VIP: implement later, after core lobby is functional.
Below: horizontal row of pack/playlist thumbnails (colored squares with labels).
Selecting a pack filters the song list below.

Selected pack is highlighted in the thumbnail row. On hover, the row expands
into a full grid/matrix showing all available packs at once (no scrolling).
Click a pack to filter the song list.

Mock: pack thumbnails are colored rectangles. Back arrow is non-functional.
Hover-expand deferred — static selection only in early phases.

### Region 2: Song list (center-left)

Tall panel. Pack title header at top (e.g., "Original Soundtrack Vol. 1").
Scrollable list of song rows, each showing:
- Cover art thumbnail (colored square placeholder)
- Song name (bold)
- Artist name (dimmer, below song name)
- Duration on the right (e.g., "2:21")
- Note count below duration

Selected row highlighted cyan. Scroll indicator at bottom when list overflows.

Mock: cover art is colored squares. Artist, duration, note count are hardcoded.

### Region 3: Detail area (center-right)

Adjacent to song list. Shows info for the currently selected song:
- Large cover art (colored square) + song name + artist
- Favorite heart icon (non-functional)
- Stats row: BPM, notes, obstacles, bombs (icons + numbers)
- Difficulty selector: 5 buttons (Easy, Normal, Hard, Expert, Expert+)
  with icons above each label. Selected button highlighted.
- Bottom row: PRACTICE button (outline, non-functional) + PLAY button (filled)

Mock: cover art, stats, favorite icon. Practice button visible but inert.

### Region 4: Highscores panel (far right, angled)

Separate panel angled away from player (tilted in 3D space).
Shows "HIGHSCORES" header, max combo, highscore values.

Mock: all values show "--" dashes.

### Region 5: Modifiers panel (far left) — DEFERRED

Vertical column: Colors, rank, modifier toggles (No Arrows, Zen Mode, etc.)
each with score percentage modifier.

Skipped for now. Not needed for song selection flow. Can add later.

## VR Pointer Handles

Lobby-internal. Glowing controller handles for menu interaction:
- Hilt mesh attached to grip transform (from xrSession)
- Emissive material + glow (theme colors: cyan left, pink right)
- Laser pointer ray extending from handle tip
- Ray interacts with GUI planes

NOT sabers — no blade, no trail. Disposed on page exit.
Design TBD — user researching approach.

## Song Catalog (music/songs.ts)

Shared module, not lobby-internal.
Static list of `{ name, seed }` entries. Seeds are real — they drive music-composer output.

## Difficulties

Five levels (Beat Saber replica): Easy, Normal, Hard, Expert, Expert+

Current types.ts has: 'easy' | 'medium' | 'hard'
Needs updating to: 'easy' | 'normal' | 'hard' | 'expert' | 'expertPlus'

## Modules

```
lobby-page/
  lobby-page.ts    — page entry, wires sub-modules, exposes onPlay + systems
  menu.ts          — multi-region GUI (all 4 active regions)
  lobby-env.ts     — 3D environment (platform, lights, fog)
  pointer.ts       — controller handles + laser rays (TBD)
```

## Implementation Phases

### Phase 1: Environment + visual shell

Build:
- Wire lobby-env.ts into lobby-page (platform, pillars, glow, fog)
- Menu layout: regions 1-4 rendered with hardcoded data
- All interactive via mouse (click on 3D planes)
- Song selection updates detail area
- Difficulty buttons toggle

Mock: everything — pack thumbnails, cover art, artist, duration,
stats, highscores, favorite icon. Play trigger is squeeze grip.

### Phase 2: Pointer handles

Build:
- Glowing hilt meshes on controllers
- Laser ray from handle tip
- Ray interacts with GUI planes (song select, difficulty, play)

Mock: cover art, stats, highscores. Play trigger moves from
squeeze grip to laser pointer on Play button.

### Phase 3: Play carries selection

Build:
- onPlay emits seed + difficulty from current menu selection
- Router forwards to arena
- Difficulty type expanded in types.ts (5-level)

Mock: cover art, stats, highscores.

### Phase 4: Song preview

Build:
- Lobby receives shared MusicPlayer from router
- Selecting a song plays preview snippet
- Switching songs stops previous, starts new preview

Mock: cover art, stats, highscores.

### Phase 5: Polish

Build:
- Real highscores (if persistence exists by then)
- Scroll indicator behavior for long song lists
- Hover/focus animations
- Any visual tweaks from VR testing

## Wiring

- [x] Squeeze grip triggers navigation to arena (temporary)
- [ ] onPlay carries seed + difficulty (phase 3)
- [ ] Laser pointer replaces squeeze grip (phase 2)
- [ ] MusicPlayer preview (phase 4)
