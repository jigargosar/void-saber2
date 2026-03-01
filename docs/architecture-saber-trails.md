Step 5 — Saber Trails

Ribbon mesh showing the swept area of the blade. Two edges: blade tip path and blade base path. Fades from opaque (newest) to transparent (oldest).

# Design Decisions

- Babylon.js `TrailMesh` tracks a single point (tube trail), not a ribbon between two points — not suitable for blade sweep.
- Custom `Mesh` with updatable `VertexData` and raw `Float32Array` buffers: zero allocation per frame, full control over vertex colors, `copyWithin` for shifting history.
- Frame-rate-dependent sampling (no fixed-interval timer). Quest 2 runs steady 72fps. `SAMPLE_COUNT` is a named constant, trivially tunable.

# New file: `src/trail.ts`

`createTrail(scene, color)` → `Trail { sample(tipWorld, baseWorld), dispose() }`

- `SAMPLE_COUNT` constant (e.g. 40 at 72fps ≈ 0.56s trail)
- `SAMPLE_COUNT × 2` vertices
- Pre-allocated `Float32Array` for positions — updated each frame via `updateVerticesData(PositionKind, ...)`
- Pre-computed vertex colors: RGB white, alpha linear 0→1 oldest→newest. Set once.
- Pre-computed indices: `(SAMPLE_COUNT - 1)` quads × 2 triangles. Set once.
- `sample()`: shift positions with `copyWithin` (single memcpy), write new tip/base pair at tail end
- First `sample()` call: fill entire buffer with given positions (avoids origin-streak artifact)
- Material: `emissiveColor = color`, `disableLighting = true`, `backFaceCulling = false`, mesh `hasVertexAlpha = true`
- Existing GlowLayer selector in stage.ts reads `StandardMaterial.emissiveColor` — trail glows automatically

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
- Computes blade tip/base world positions via `Vector3.TransformCoordinatesToRef(localOffset, blade.getWorldMatrix(), outVec)`, calls `trail.sample()`
- Pre-allocated `Vector3`s for local offsets and world-space results (zero allocation per frame)

# Modify: `src/main.ts`

- Add `sabers.trailUpdateSystem` to `startGameLoop` systems array (alongside `stage.beatDecaySystem`)

# After implementation

Note: architecture-drop-ecs.md module map lists trail.ts + trail-update.ts as separate
files. Actual implementation puts trail updating in saber.ts. Update module map to match.

# Testing

- Verify trail ribbon follows blade tip/base correctly in VR
- Check trail glow intensity — if over-bloomed, add name-based exclusion back to GlowLayer selector in stage.ts
- Confirm no origin-streak on first frame
- Check Quest 2 perf with both trails active
