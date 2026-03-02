Plan: Lobby Page

## Goal

Beat Saber-style VR lobby. Dark neon environment, two-panel song selection UI,
VR controller handles with laser pointers for interaction.

## Dependencies (from router)

Lobby receives from router (see architecture.md):
- scene
- xrSession — controllers for pointer handles

Lobby emits: onPlay(seed, difficulty) → router navigates to arena.

## Scope

Lobby visuals + interaction. Song catalog lives in music/songs.ts (shared).
Pointer handles + rays are lobby-internal (disposed on page exit).

## Environment

Dark room with neon atmosphere:
- Platform/floor with subtle grid lines
- Neon accent lighting (cyan/pink from theme)
- Glow layer for all emissive elements
- Ambient fog to frame the space
- Possible: slow-moving particles or subtle background animation

No complex geometry. Mood comes from lighting and glow.

## Song Selection UI

Two-panel Beat Saber replica layout. Babylon.js GUI on 3D planes.

Left panel — song list:
- Hardcoded song names
- Selected row highlighted

Right panel — details + actions:
- Song title (large)
- Difficulty button row: Easy, Normal, Hard, Expert, Expert+
- Play button

Both panels at eye height (~1.4m), slight tilt toward player,
spaced ~1.2m left/right of center.

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
  menu.ts          — two-panel GUI (song list + detail panel)
  lobby-env.ts     — 3D environment (platform, lights, fog)
  pointer.ts       — controller handles + laser rays (TBD)
```

## Wiring

- [x] Router: forward seed + difficulty — arch doc confirms route carries these
