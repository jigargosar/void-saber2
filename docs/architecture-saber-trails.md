Step 5 — Saber Trails

Ribbon mesh showing the swept area of the blade. Two edges: blade tip path and blade base path. Fades from opaque (newest) to transparent (oldest).

# Design Decisions

- Babylon.js `TrailMesh` tracks a single point (tube trail), not a ribbon between two points — not suitable for blade sweep.
- Custom `Mesh` with updatable `VertexData` and raw `Float32Array` buffers: zero allocation per frame, full control over vertex colors, `copyWithin` for shifting history.
- Sub-frame interpolation for fast swings (see Sampling section).
- Distance-based fading for consistent trail length (see Fading section).

# Risks

## 1. Vertex alpha with emissive-only material — MUST SPIKE FIRST

The plan assumes vertex color alpha creates the fade when `disableLighting = true`.
`StandardMaterial`'s fragment shader applies vertex colors to the diffuse channel.
With lighting disabled, output is primarily `emissiveColor`. Vertex color alpha may
not control output alpha in that path — if so, the trail renders fully opaque
everywhere and the entire fade approach silently fails.

**Action**: spike a minimal test (one quad, vertex alpha gradient, emissive-only
StandardMaterial, `hasVertexAlpha = true`) before building the full trail.
**Fallback**: `ShaderMaterial` or `NodeMaterial` with explicit alpha control.

## 2. Glow layer will over-bloom the trail tail

The custom selector in stage.ts sets alpha=1 for all `StandardMaterial` emissive.
The glow pass renders the trail at full intensity even where vertex alpha says
transparent. Known issue — will need name-based exclusion or custom glow handling.

## 3. Stale world matrix

`trailUpdateSystem` runs in `onBeforeRenderObservable`, before the scene evaluates
meshes. The blade's world matrix may be stale from the previous frame. Must call
`blade.computeWorldMatrix(true)` before `getWorldMatrix()`.

# Sampling

One sample per frame is insufficient for fast swings (~7 samples for a 0.1s swing
at 72fps). Straight line segments between far-apart samples look jagged.

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
Ring buffer writes multiple entries when needed — `copyWithin` shifts by step count.

# Fading

Fixed sample count + fast motion = physically long trails that look terrible.

**Distance-based alpha**: vertex alpha is based on cumulative arc distance from
newest sample, not buffer index. Trail always covers the same physical length
(`MAX_TRAIL_DISTANCE`) regardless of speed.

- Slow motion: many samples within the distance cap, dense trail
- Fast motion: fewer samples within the same distance cap, same physical length
- Stationary: all samples overlap, cumulative distance ≈ 0, trail invisible

This also solves the "cloth" problem — no velocity threshold needed. When the blade
is still, distance between samples is zero, so all alpha ≈ 0.

# New file: `src/trail.ts`

`createTrail(scene, color)` → `Trail { sample(tipWorld, baseWorld, dt), dispose() }`

- Ring buffer with `MAX_VERTICES` capacity (pre-allocated)
- `Float32Array` for positions — updated via `updateVerticesData(PositionKind, ...)`
- Vertex colors: RGB from trail color, alpha computed from cumulative arc distance
- Indices: updated to match active vertex count
- `sample()`: sub-frame interpolation, distance-based alpha recomputation
- First `sample()` call: fill entire buffer with given positions (avoids origin-streak artifact)
- Material: `emissiveColor = color`, `disableLighting = true`, `backFaceCulling = false`, mesh `hasVertexAlpha = true`

# Modify: `src/saber.ts`

Note: `buildSaber` currently returns bare `TransformNode`. This step upgrades it to
`{ root, blade }` — the deferred BladeSegment work from step 4. Internal Map changes
from `Map<Hand, TransformNode>` to `Map<Hand, { root, blade, trail }>`. External
`Sabers` interface stays the same, just gains `trailUpdateSystem`.

- `buildSaber` returns `{ root, blade }` instead of just `root` (need blade `Mesh` for world matrix)
- Internal type for per-hand state: `{ root, blade, trail }`
- `attach`: builds saber + creates trail
- `detach`: disposes trail + saber
- New `trailUpdateSystem: System` on `Sabers` interface
- Calls `blade.computeWorldMatrix(true)` before reading world matrix
- Computes blade tip/base world positions via `Vector3.TransformCoordinatesToRef(localOffset, blade.getWorldMatrix(), outVec)`, calls `trail.sample()`
- Stores previous tip/base positions for sub-frame interpolation
- Pre-allocated `Vector3`s for local offsets and world-space results (zero allocation per frame)

# Modify: `src/main.ts`

- Add `sabers.trailUpdateSystem` to `startGameLoop` systems array (alongside `stage.beatDecaySystem`)

# Implementation order

1. **Spike**: verify vertex alpha works with emissive-only StandardMaterial
2. If spike fails: evaluate ShaderMaterial/NodeMaterial fallback
3. Implement trail.ts with sub-frame interpolation + distance-based fading
4. Modify saber.ts (BladeSegment types, trailUpdateSystem)
5. Wire in main.ts

# After implementation

Note: architecture-drop-ecs.md module map lists trail.ts + trail-update.ts as separate
files. Actual implementation puts trail updating in saber.ts. Update module map to match.

# Testing

- **Spike result**: does vertex alpha fade work with emissive-only material?
- Verify trail ribbon follows blade tip/base correctly in VR
- Fast swing smoothness — are sub-frame interpolated samples sufficient?
- Trail length consistency — does distance-based fading cap physical length?
- Stationary blade — trail should be invisible (no cloth effect)
- Check trail glow intensity — likely needs exclusion from GlowLayer
- Confirm no origin-streak on first frame
- Check Quest 2 perf with both trails active
