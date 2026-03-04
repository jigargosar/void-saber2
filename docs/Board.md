Board

# Urgent

# InBasket

# Ready

# InProgress

- Lobby menu visual improvements (10 issues in plan-lobby.md)

# Done

- Arena event queue: beat schedule + song end detection via arena-events.ts
- Choreography refactor: consumes grid steps + energy (no more BeatTimeline)
- Stage refactor: receives beat events from arena event queue
- Composer refactor: takes grid as input, outputs events only
- Extract rhythm grid: createRhythmGrid(seed) → RhythmGrid with StepInfo[]
- Music player decoupled: no onBeat callback, no CommandQueue dependency
- Deleted beat-timeline.ts (replaced by rhythm grid steps)
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

- Directional arrows on cube faces (step 12)
- Direction-based collision: verify saber velocity vs required swingDirection
- Environment dispose: full cleanup of pillars, track, ribs, lights (currently only glow layer is disposed; scene.dispose() covers it at shutdown, but module-level teardown should be explicit)
- GlowLayer Quest 2 perf: reduce to mainTextureSamples:1, blurKernelSize:32, mainTextureFixedSize:512
- Color3.scale() allocations: use scaleToRef() in beat render system + early-out when intensity=0
- WebXR: disable online controller repository
- WebXR: watch for hardwareScalingLevel reset on XR session start
- WebXR: detach FreeCamera controls on XR start
