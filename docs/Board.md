Board

# Urgent

# InBasket

# Ready

- Choreography — createChoreography(composition, beatTimeline, difficulty) → Choreography (step 10)

# InProgress

- Wire menu into lobby with command queue

# Done

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
- Pool Babylon.js meshes for beat cubes (step 11)
