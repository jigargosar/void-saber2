SUPERSEDED — ECS dropped. See architecture-drop-ecs.md and architecture-drop-ecs-conversation-summary.md.

Architecture Review — ECS + Babylon.js + Koota

Conducted after milestone 2 (engine + scene + environment). Four expert agents
analyzed the codebase in parallel: ECS Architecture, Babylon.js/WebXR, Scalability,
and Code Quality.

## Expert Proposals

Four expert perspectives, each with a distinct lens:

1. ECS Architecture — Is our trait/query/action/system pattern idiomatic Koota?
   World.ts as the hub? Anti-patterns? How does this hold for 6 more milestones
   (controllers, sabers, trails, collision, beats, cubes)?

2. Babylon.js / WebXR — Scene refs in traits safe? Glow layer config? Disposal
   patterns? Will onQueryRemove reliably clean up Babylon objects? WebXR session
   lifecycle concerns?

3. Scalability — Flat src/ hold at 8 files? World.ts god-file risk? System
   ordering — flat array enough or dependency graphs? State machine fit? Entity
   pooling?

4. Code Quality — Audit against CLAUDE.md standards: ISI, TDA, SSOT, magic
   numbers, spooky action. Type safety of traits. Naming consistency.

Not proposed (yet): Performance (premature with only 2 milestones), Audio/Music
(not ported yet).

## Consolidated Findings

### Critical (fix now)

1. BeatVisuals scene/glow are Scene | null but never null at runtime — ISI
   violation. Every system null-checks something that can't happen.
   Flagged by: Code Quality + ECS.
   Fix: Move Scene to world-level trait (eliminates nullability).

2. world.onQueryRemove at module import time — spooky action. Importing stage.ts
   for any reason mutates global world state.
   Flagged by: Code Quality.
   Fix: Move inside setupStage, capture unsubscribe handle.

### High (fix before next milestone)

3. GlowLayer config too expensive for Quest 2. 4x MSAA + 64-tap blur at full
   resolution = dropped frames.
   Flagged by: Babylon.js.
   Fix: Reduce to samples:1, blur:32, fixedSize:512.

4. Color3.scale() allocates ~2000 objects/sec during beat render. GC pressure
   on Quest 2.
   Flagged by: Babylon.js.
   Fix: Use scaleToRef() + early-out when intensity=0.

### Medium (fix soon)

5. beatPulses() re-hashes query every frame instead of caching.
   Flagged by: ECS.
   Fix: Use Koota's cacheQuery().

6. triggerBeat queries BeatPulse alone, but systems query BeatPulse+BeatVisuals.
   Latent mismatch.
   Flagged by: ECS.
   Fix: Align query or guarantee traits always co-exist.

7. ~20 magic numbers in stage.ts. Worst: 0.12 (decay rate), 0.8 (fog mult),
   1.5 (pillar mult).
   Flagged by: Code Quality.
   Fix: Name the gameplay tuning values.

8. dt: number should be Seconds type alias per project standards.
   Flagged by: Code Quality.
   Fix: Add type alias.

### Architecture Validation (confirmed sound)

All experts agreed:

1. Flat file structure holds through milestone 8. Split into subdirectories at
   step 10 (beatmaps/cubes).
2. world.ts stays cohesive at ~150 lines through milestone 8. Not a god file.
3. Flat system array is sufficient. Named phase groups when state machine arrives
   (step 18).
4. One world is correct. Trait-based queries provide enough separation.
5. Pool Babylon.js meshes, not Koota entities for beat cubes.
6. GameState as a singleton trait for the future state machine.
7. Trait split (BeatPulse data + BeatVisuals refs) is correct — matches Koota's
   schema vs callback trait distinction.
8. ECS pattern (traits in world.ts, systems near their domain) is sound.

## Key Discovery: World-Level Traits

Koota has two levels for traits:

World-level — global state, one value for the entire world:
    world.add(SceneRef(scene))       // set once
    world.get(SceneRef)              // read anywhere, no query needed

Entity-level — per-entity data, queried in systems:
    world.spawn(BeatPulse())         // on an entity
    world.query(BeatPulse)           // find entities that have it

Scene, Theme, and fogBaseDensity are inherently global — there's one scene, one
theme, one fog base. They belong on the world, not on an entity. This eliminates
the ISI violation (nullable defaults for non-nullable data) and the singleton
entity pattern.

## Cross-Expert Convergence

The ECS expert and Code Quality expert independently flagged the same root cause:
putting Scene in an entity trait creates both an ISI violation (nullable type for
non-nullable data) and a conceptual mismatch (Scene is global, not per-entity).
Koota's world-level traits solve both problems simultaneously.

## ECS Expert — Detailed Report

### 1. Trait Design

BeatPulse (pure data) + BeatVisuals (Babylon refs) split is correct and idiomatic.
Koota distinguishes schema-based traits (SoA for primitives) from callback-based
traits (AoS for object references). Both currently use callback form.

Concerns:
- BeatPulse could be a schema trait: trait({ intensity: 0 }) for SoA storage.
- Scene in BeatVisuals is a global resource, not per-entity. Should be world-level.
- pillarTargets embeds StandardMaterial refs. Fine for now, but if pillars become
  entities, this array becomes a second source of truth.

### 2. Query/Action/System Pattern

- beatPulses() wraps world.query() but doesn't use cacheQuery(). Re-hashes every
  frame.
- triggerBeat() as a plain function is fine (createActions is for React integration).
- triggerBeat() queries BeatPulse alone vs systems querying BeatPulse+BeatVisuals.
  Latent mismatch if an entity ever has BeatPulse without BeatVisuals.

### 3. System Uniformity

System = (dt: number) => void is sufficient for now. For the state machine (step
18), recommend a world-level GamePhase trait. Systems self-gate with early returns.

### 4. Lifecycle Hooks

onQueryRemove is the correct Koota API. Concerns:
- world.reset() may not trigger onQueryRemove — verify before using for restarts.
- Returned unsubscribe function is currently ignored.
- Module-level registration is a side effect at import time.

### 5. Scalability

- WebXR controllers: pattern extends naturally with onQueryAdd/onQueryRemove.
- Saber geometry: callback traits for mesh refs, same pattern as BeatVisuals.
- Trail vertex buffers: mutable Float32Array in callback traits is idiomatic AoS.
- Collision: brute-force pairwise iteration is fine for 2 sabers. O(n) for
  saber-vs-cubes with <100 cubes.
- No event system exists. Recommend plain array buffer flushed per frame for
  collision events.

### 6. Anti-Patterns

- Singleton entity as global state: consider world-level traits instead.
- Missing cacheQuery: minor perf issue, anti-pattern per Koota docs.
- Module-level onQueryRemove: hidden side effect.
- No god entities (2 traits max). No over-querying.

## Babylon.js Expert — Detailed Report

### 1. Scene Refs in Traits

Safe for single-scene game. Refs won't go stale during normal gameplay. Koota
stores trait data as plain JS objects — no special lifecycle. Babylon.js scene
registries are the true owners, ECS just holds convenience references.

### 2. Disposal Patterns

GlowLayer disposal via onQueryRemove is correct. Meshes from setupTrack/setupRibs/
setupPillars are never explicitly disposed — acceptable for single-scene game
since scene.dispose() handles them. If teardown/rebuild needed later, parent
meshes under a single TransformNode for recursive disposal.

### 3. GlowLayer Config (HIGH)

Current: mainTextureSamples:4, blurKernelSize:64, no fixed size.
Problem: 4x MSAA + 64-tap blur at full headset resolution per eye is expensive
on Quest 2's Adreno 650.

Recommended for Quest 2:
    mainTextureFixedSize: 512
    mainTextureSamples: 1
    blurKernelSize: 32

Roughly 4-8x lower GPU cost, visually similar (glow is inherently soft).

### 4. Color3 Allocation (HIGH)

baseColor.scale() creates new Color3 every call. 28 pillars at 72fps = 2016
allocations/sec. GC pressure on Quest 2.

Fix: baseColor.scaleToRef(factor, mat.emissiveColor) — writes directly into
existing emissive color, zero allocations. Add early-out when intensity <= 0.

### 5. WebXR (planned)

- Disable online controller repository (no network fetch for models you won't use).
- Disable pointer selection.
- Watch for hardwareScalingLevel reset on XR session start.
- local-floor reference space is correct for standing experience.

### 6. Camera Transition

FreeCamera to XR camera is automatic. FreeCamera persists in scene.cameras (by
design). Consider detaching FreeCamera controls on XR start. Ensure track faces
negative Z. Fog is camera-independent, transition is seamless.

## Scalability Expert — Detailed Report

### 1. File Structure

Projected at milestone 8: ~14 files. Flat src/ is manageable.
Split at step 10 when cubes arrive with their own factories/systems/data.
Natural boundaries: core/, stage/, xr/, saber/, beats/, audio/, ui/, state/.

### 2. world.ts Growth

Projected at milestone 8: ~10-12 traits, ~8-10 types, ~5-6 queries, ~2-3 actions.
~120-150 lines. Not a god file. Split by domain when cubes arrive (step 10+).
Note: stage-specific types (PillarPulseTarget) already leaking into world.ts.

### 3. System Ordering

Projected: ~6 systems at milestone 8, ~12 at step 23. Flat array is fine through
milestone 8. Named phase groups at step 18 (state machine). Formal dependency
frameworks are overkill — system count won't exceed 15.

### 4. State Machine

Recommend GameState trait on singleton entity (or world-level trait). Transition
actions in world.ts. Systems guard with early returns. Keeps ECS as single source
of truth.

### 5. Entity Pooling

Pool Babylon.js meshes, not Koota entities. Visual pipeline's onQueryAdd grabs
from pool, onQueryRemove returns to pool. spawn/destroy stay clean.

### 6. Single vs Multiple Worlds

One world. Almost every entity type interacts with at least one other type.
Trait-based query filtering provides sufficient separation.

## Code Quality Expert — Detailed Report

### ISI Violations

CRITICAL: BeatVisuals scene: Scene | null and glow: GlowLayer | null. Only spawn
site always provides non-null values. Forces defensive null-checks everywhere.

WARNING: entity.get(BeatPulse) null-checks after query. May be Koota API
constraint (return type is T | undefined even after query match).

### TDA Violations

WARNING: beatRenderSystem reaches into BeatVisuals internals (scene, fogBaseDensity,
pillarTargets). Standard ECS tension — systems operating on trait data is the norm,
but it's "ask" not "tell."

### SSOT

No violations. FOG_DENSITY_BASE flows into fogBaseDensity at spawn time — proper
data flow, not duplication.

### Magic Numbers (WARNING)

~20 unnamed numeric literals in stage.ts. Highest concern: gameplay tuning values
embedded in system logic (0.12 decay rate, 0.8 fog multiplier, 1.5 pillar
multiplier). Also: glow config values, track/edge dimensions, pillar geometry.

### Type Safety (WARNING)

System type's dt: number should be Seconds alias. BeatPulse.intensity is 0-1
normalized value — could use UnitInterval alias (lower priority).

### Spooky Action (CRITICAL)

world.onQueryRemove at module import time. Side effect invisible to importer.
Creates hidden ordering dependency. Can't be torn down or double-registers on
re-import.

Also: window resize listener never cleaned up (minor for single-init app).

### Naming

WARNING: beatPulses() name doesn't reflect BeatVisuals requirement in the query.
INFO: PILLAR_GAP could be PILLAR_SPACING_Z. setupCamera missing return type.
