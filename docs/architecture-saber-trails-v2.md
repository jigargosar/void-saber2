Step 5 — Saber Trails (v2)

Rewrite of v1 trail approach. v1 had: init-fill "axe" artifact, flat cloth appearance
(uniform tip/base alpha), emit threshold causing gap splits, no acceleration fade.

# Design Decisions

- Custom `Mesh` with updatable `VertexData` and raw `Float32Array` buffers: zero allocation per frame, full control over vertex colors.
- `copyWithin` for shifting ring buffer history.
- Distance-based alpha for consistent physical trail length regardless of speed.
- Acceleration-driven fade rate — fast swings fade faster, slow swings linger.
- Tip/base alpha split — blade-sweep streak, not flat cloth ribbon.
- Sub-frame interpolation for fast swing smoothness.
- Always write every frame — no emit threshold. Degenerate triangles when stationary are invisible. Buffer cycles naturally, old movement fades out.
- Grow buffer from 0 — `subMeshes[0].indexCount` limits rendering to active quads. No init fill (caused "axe" artifact in v1).
- Blade positions via local-space constants + `TransformCoordinatesToRef` (no marker nodes needed — cleaner than v1 plan).

# Confirmed from reference

Vertex alpha with emissive-only StandardMaterial works. White vertex color RGB,
per-vertex alpha, `hasVertexAlpha = true`, `emissiveColor` for color,
`disableLighting = true`. Also confirmed: `dispose(false, true)`, `copyWithin`
shifting, `backFaceCulling = false`.

# What failed in v1

- **Init fill → "axe" artifact**: filling all 40 samples with first position created a cluster that connected to first real movement with visible large triangles.
- **Uniform tip/base alpha → cloth**: both vertices got same alpha, trail looked like flat ribbon instead of blade sweep.
- **Emit threshold → gap splits**: skipping samples when stationary left gaps between trail segments on resume.
- **Static vertex colors → no fade**: alpha computed once at init from buffer index, never recomputed. No distance-based or acceleration-driven fading.

# Risks

## 1. Glow layer will over-bloom the trail tail

The custom selector in stage.ts sets alpha=1 for all `StandardMaterial` emissive.
The glow pass renders the trail at full intensity even where vertex alpha says
transparent. Known issue — will need name-based exclusion or custom glow handling.

## 2. Stale world matrix

`trailUpdateSystem` runs in `onBeforeRenderObservable`, before the scene evaluates
meshes. Blade world matrix may be stale from previous frame. Must call
`blade.computeWorldMatrix(true)` before reading positions.

## 3. Frustum culling

Trail mesh starts at origin with zero positions. Bounding box doesn't update
correctly as trail moves.

**Fix**: `mesh.alwaysSelectAsActiveMesh = true` — bypasses frustum culling.

# Sampling

Always write every frame. No emit threshold — stationary blade writes degenerate
triangles (tip==base from previous frame, zero area, invisible). Buffer cycles
naturally and old movement fades via distance-based alpha.

**Sub-frame interpolation**: when blade tip moved more than `MAX_SAMPLE_SPACING`
since last sample, lerp between previous and current positions and write multiple
evenly-spaced samples:

```ts
const dist = Vector3.Distance(prevTip, currTip)
const steps = Math.max(1, Math.ceil(dist / MAX_SAMPLE_SPACING))
for (let i = 1; i <= steps; i++) {
    const t = i / steps
    writeSample(lerp(prevTip, currTip, t), lerp(prevBase, currBase, t))
}
```

Slow motion: 1 sample per frame. Fast swing: 3-5 samples, evenly spaced.

# Fading

Two mechanisms combine for trail alpha:

## Distance-based alpha (trail length)

Walk backward from newest sample, accumulate tip-to-tip distance. Alpha decreases
with distance: `alpha = max(0, 1 - cumDist / MAX_TRAIL_DISTANCE)`. Trail always
covers the same physical length regardless of speed.

## Acceleration-driven fade rate

Compute speed delta (acceleration) each frame. Scale the distance-based alpha by
a fade multiplier that increases with acceleration:

```ts
const accel = Math.abs(speed - prevSpeed)
const fadeRate = clamp(1 + accel * ACCEL_SENSITIVITY, FADE_RATE_MIN, FADE_RATE_MAX)
// fadeRate multiplies the distance divisor, making alpha drop faster during fast swings
```

Fast swings → higher fadeRate → trail fades sooner. Slow swings → fadeRate near 1 → trail lingers at full distance.

## Tip/base alpha split

Tip vertex gets `alpha * SPAWN_ALPHA_TIP` (0.4), base vertex gets `alpha * SPAWN_ALPHA_BASE` (0.05). Creates a bright edge at the blade tip that tapers to near-invisible at the base — blade-sweep streak effect, not flat cloth.

# Constants

```
SAMPLE_COUNT       = 60     // ring buffer capacity
MAX_SAMPLE_SPACING = 0.02   // sub-frame interpolation threshold (meters)
MAX_TRAIL_DISTANCE = 0.5    // physical trail length cap (meters)
SPAWN_ALPHA_TIP    = 0.4    // tip vertex alpha at spawn
SPAWN_ALPHA_BASE   = 0.05   // base vertex alpha at spawn
ACCEL_SENSITIVITY  = 300     // acceleration → fade rate scaling
FADE_RATE_MIN      = 0.5    // minimum fade rate multiplier
FADE_RATE_MAX      = 5.0    // maximum fade rate multiplier
```

# Rewrite: `src/trail.ts`

`createTrail(scene, name, color)` → `Trail { sample(tipWorld, baseWorld), dispose() }`

- Ring buffer with `SAMPLE_COUNT` capacity (pre-allocated Float32Arrays)
- `sampleCount` starts at 0, grows to `SAMPLE_COUNT`
- `mesh.subMeshes[0].indexCount` limits rendering to `max(0, (sampleCount - 1) * 6)` — only active quads drawn
- `mesh.alwaysSelectAsActiveMesh = true` — bypass frustum culling
- Positions: `Float32Array(SAMPLE_COUNT * 2 * 3)`, updated via `updateVerticesData(PositionKind, ...)`
- Colors: `Float32Array(SAMPLE_COUNT * 2 * 4)`, recomputed every frame from distance + acceleration + tip/base split
- Indices: static, pre-built for full capacity (inactive quads have degenerate geometry)
- `sample()`: sub-frame interpolation → `writeSample()` → `recomputeColors()` → upload buffers
- `writeSample()`: if `sampleCount < SAMPLE_COUNT`, append and increment; else `copyWithin` shift and overwrite last slot
- `recomputeColors()`: walk backward from newest, accumulate distance, apply fadeRate, apply tip/base split
- Tracks `prevTip`, `prevBase`, `prevSpeed` for interpolation and acceleration
- Material: `emissiveColor = color`, `disableLighting = true`, `backFaceCulling = false`, `hasVertexAlpha = true`

# No changes needed: `src/saber.ts`

Already wired correctly. Uses `BLADE_TIP_LOCAL`/`BLADE_BASE_LOCAL` constants with
`TransformCoordinatesToRef` — cleaner than marker nodes from v1 plan. Calls
`blade.computeWorldMatrix(true)` before reading positions. `trailUpdateSystem`
already on `Sabers` interface.

# No changes needed: `src/main.ts`

Already wired. `sabers.trailUpdateSystem` in `startGameLoop` systems array.

# After implementation

Update architecture-drop-ecs.md module map if trail.ts description changed.

# Testing

- Verify trail ribbon follows blade tip/base correctly in VR
- Fast swing smoothness — sub-frame interpolated samples fill gaps?
- Trail length consistency — distance-based fading caps physical length?
- Stationary blade — trail should be invisible (degenerate triangles + distance fade)
- Acceleration effect — fast swings produce shorter/faster-fading trails?
- Tip/base split — trail looks like blade sweep streak, not flat cloth?
- No "axe" artifact on first frame (buffer grows from 0)
- No gap splits when resuming movement (no emit threshold)
- Trail not culled during movement (alwaysSelectAsActiveMesh)
- Check trail glow intensity — likely needs exclusion from GlowLayer
- Check Quest 2 perf with both trails active
