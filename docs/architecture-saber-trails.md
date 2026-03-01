DEPRECATED

Step 5 — Saber Trails

Ribbon mesh showing the swept area of the blade. Two edges: blade tip path and blade base path. Fades from opaque (newest) to transparent (oldest).

# Design Decisions

- Babylon.js `TrailMesh` tracks a single point (tube trail), not a ribbon between two points — not suitable for blade sweep.
- Custom `Mesh` with updatable `VertexData` and raw `Float32Array` buffers: zero allocation per frame, full control over vertex colors, `copyWithin` for shifting history.
- Sub-frame interpolation for fast swings (see Sampling section).
- Distance-based fading for consistent trail length (see Fading section).
- Emit threshold: skip sampling when blade hasn't moved enough (see Sampling section).
- Blade positions via marker TransformNodes with `getAbsolutePosition()` (simpler than manual matrix math).

# Confirmed from reference

Vertex alpha with emissive-only StandardMaterial works. Reference uses the same
approach: white vertex color RGB, per-vertex alpha, `hasVertexAlpha = true`,
`emissiveColor` for color, `disableLighting = true`. No spike needed.

Also confirmed fine: `dispose(false, true)`, `copyWithin` shifting,
`backFaceCulling = false`.

# Risks

## 1. Glow layer will over-bloom the trail tail

The custom selector in stage.ts sets alpha=1 for all `StandardMaterial` emissive.
The glow pass renders the trail at full intensity even where vertex alpha says
transparent. Known issue — will need name-based exclusion or custom glow handling.

## 2. Stale world matrix

`trailUpdateSystem` runs in `onBeforeRenderObservable`, before the scene evaluates
meshes. Marker node world positions may be stale from the previous frame. Must call
`blade.computeWorldMatrix(true)` before reading positions.

## 3. Frustum culling

Trail mesh starts at origin with zero positions. Bounding box computed from initial
geometry doesn't update correctly as trail moves. Babylon.js frustum culling could
hide the trail unexpectedly.

**Fix**: `mesh.alwaysSelectAsActiveMesh = true` — bypasses frustum culling.

# Sampling

One sample per frame is insufficient for fast swings (~7 samples for a 0.1s swing
at 72fps). Straight line segments between far-apart samples look jagged.

**Emit threshold**: skip sampling when blade tip has moved less than `MIN_SAMPLE_DIST`
(e.g. 0.01 units) since last sample. Prevents wasting buffer cycles when stationary.
Combined with distance-based fading, stationary blade = invisible trail + no buffer churn.

**Sub-frame interpolation**: when blade tip moved more than `MAX_SAMPLE_SPACING`
since last sample, lerp between previous and current positions and write multiple
evenly-spaced samples:

```ts
const dist = Vector3.Distance(prevTip, currTip)
if (dist < MIN_SAMPLE_DIST) return  // emit threshold

const steps = Math.max(1, Math.ceil(dist / MAX_SAMPLE_SPACING))
for (let i = 1; i <= steps; i++) {
    const t = i / steps
    writeSample(lerp(prevTip, currTip, t), lerp(prevBase, currBase, t))
}
```

Slow motion: 1 sample per frame. Fast swing: 3-5 samples, evenly spaced.
Stationary: no samples written. Ring buffer writes multiple entries when needed.

# Fading

Fixed sample count + fast motion = physically long trails that look terrible.

**Distance-based alpha**: vertex alpha is based on cumulative arc distance from
newest sample, not buffer index. Trail always covers the same physical length
(`MAX_TRAIL_DISTANCE`) regardless of speed.

- Slow motion: many samples within the distance cap, dense trail
- Fast motion: fewer samples within the same distance cap, same physical length
- Stationary: no samples written (emit threshold), trail fades out

This also solves the "cloth" problem — emit threshold + distance-based alpha.
When the blade is still, no new samples are written and existing ones fade.

# New file: `src/trail.ts`

`createTrail(scene, color)` → `Trail { sample(tipWorld, baseWorld), dispose() }`

- Ring buffer with `MAX_VERTICES` capacity (pre-allocated)
- `Float32Array` for positions — updated via `updateVerticesData(PositionKind, ...)`
- `Float32Array` for vertex colors — updated via `updateVerticesData(ColorKind, ...)`
- Alpha recomputed each frame from cumulative arc distance
- Indices: updated to match active vertex count
- `sample()`: emit threshold check, sub-frame interpolation, alpha recomputation
- First `sample()` call: fill entire buffer with given positions (avoids origin-streak artifact)
- Material: `emissiveColor = color`, `disableLighting = true`, `backFaceCulling = false`, mesh `hasVertexAlpha = true`
- `mesh.alwaysSelectAsActiveMesh = true` — bypass frustum culling

# Modify: `src/saber.ts`

Note: `buildSaber` currently returns bare `TransformNode`. This step adds two marker
`TransformNode`s (`bladeBase`, `bladeTip`) parented to the blade mesh at the appropriate
local offsets. Internal Map changes from `Map<Hand, TransformNode>` to
`Map<Hand, { root, bladeBase, bladeTip, trail }>`. External `Sabers` interface stays
the same, just gains `trailUpdateSystem`.

- `buildSaber` adds `bladeBase` and `bladeTip` TransformNode markers parented to blade mesh
- Internal type for per-hand state: `{ root, bladeBase, bladeTip, trail }`
- `attach`: builds saber + creates trail
- `detach`: disposes trail + saber
- New `trailUpdateSystem: System` on `Sabers` interface
- Calls `blade.computeWorldMatrix(true)` before reading marker positions
- Reads world positions via `bladeBase.getAbsolutePosition()` and `bladeTip.getAbsolutePosition()`
- Stores previous tip/base positions for sub-frame interpolation
- Pre-allocated `Vector3`s for previous positions (zero allocation per frame)

# Modify: `src/main.ts`

- Add `sabers.trailUpdateSystem` to `startGameLoop` systems array (alongside `stage.beatDecaySystem`)

# Implementation order

1. Implement trail.ts (emit threshold, sub-frame interpolation, distance-based fading, alwaysSelectAsActiveMesh)
2. Modify saber.ts (marker nodes, trailUpdateSystem)
3. Wire in main.ts

# After implementation

Note: architecture-drop-ecs.md module map lists trail.ts + trail-update.ts as separate
files. Actual implementation puts trail updating in saber.ts. Update module map to match.

# Testing

- Verify trail ribbon follows blade tip/base correctly in VR
- Fast swing smoothness — are sub-frame interpolated samples sufficient?
- Trail length consistency — does distance-based fading cap physical length?
- Stationary blade — trail should be invisible (emit threshold + distance fading)
- Check trail glow intensity — likely needs exclusion from GlowLayer
- Confirm no origin-streak on first frame
- Confirm trail not culled during movement (alwaysSelectAsActiveMesh)
- Check Quest 2 perf with both trails active

# Acceptable simplifications (vs reference)

- Pre-computed color fade vs per-frame color update — our distance-based alpha recomputes
  each frame anyway, so effectively same approach
- No acceleration-based fade speed — fixed fade, fine for prototype
- Marker nodes instead of manual matrix math — simpler, less error-prone
