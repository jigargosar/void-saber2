Board

# Urgent

# InBasket

# Ready

# InProgress

- Extract rhythm grid (see plan-arena.md for details)
- Composer refactor: takes grid as input (see plan-arena.md)
- Stage refactor: consumes grid directly (see plan-arena.md)
- Choreography refactor: consumes grid steps + energy (see plan-arena.md)
- Arena event queue: replace direct callbacks (see plan-arena.md)
- Lobby menu visual improvements (10 issues in plan-lobby.md)

# Done

- Cube spawning + movement on music clock (step 11 — hardcoded, uses choreography)
- Saber-cube collision detection (segment-to-sphere)
- Move music types to owning modules (delete music-types.ts)
- Choreography — createChoreography(composition, beatTimeline, config) → Choreography (step 10)
- Wire menu into lobby with command queue
- Command queue — replace callback navigation with frame-deferred command drain
- Music player — createMusicPlayer(composition, onBeat) → MusicPlayer (step 9)
- Beat timeline — extractBeatTimeline(composition) → BeatTimeline (step 8)
- Music composer — composeMusic(seed) → MusicComposition (step 7)
- Saber trails — velocity-driven opacity, distance fade, live sample (step 5)
- Implement controllers + sabers (steps 3-4)
- Drop ECS, establish module architecture

# Backlog

- Environment dispose: full cleanup of pillars, track, ribs, lights (currently only glow layer is disposed; scene.dispose() covers it at shutdown, but module-level teardown should be explicit)
- GlowLayer Quest 2 perf: reduce to mainTextureSamples:1, blurKernelSize:32, mainTextureFixedSize:512
- Color3.scale() allocations: use scaleToRef() in beat render system + early-out when intensity=0
- Name magic numbers in stage.ts: 0.12 decay rate, 0.8 fog mult, 1.5 pillar mult
- WebXR: disable online controller repository
- WebXR: watch for hardwareScalingLevel reset on XR session start
- WebXR: detach FreeCamera controls on XR start
