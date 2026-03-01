Conversation Summary

We started from a place of frustration — going back and forth between Koota and Miniplex ECS libraries, with accumulated knowledge that
was a mix of truth and wrong assumptions, and no way to tell which was which.

Phase 1: Audit of Recorded Knowledge

I surveyed both projects (void-saber and void-saber2) and all documentation. Initially I flagged version mismatches (koota@0.6.5
installed vs docs pinned to 1.1.1, defineQuery in README doesn't exist in installed version, Wildcard not exported, cacheQuery
deprecated). You pushed back: none of these version mismatches actually affected the application. The real problems were wrong
assumptions about how to use the libraries, not API mismatches.

Phase 2: Identifying the Real Problems

I proposed three design problems:

1. No decision framework for what goes in ECS vs plain code — Two implementations of the same beat system (closure in game-koota, traits
   in void-saber2), neither landing on the idiomatic answer (world-level traits for globals).
2. Nullable trait defaults for external objects — Koota infers trait types from factory returns. For Babylon.js objects you can't
   construct without runtime context (WebXRInputSource, Mesh), the only honest factory returns null, polluting every access with T | null.
   I initially called this a "design problem."
3. Singleton entities for global state — Using world.spawn(BeatPulse()) for data that's inherently global, when Koota has world-level
   traits for exactly this.

Phase 3: You Corrected My Framing

You challenged me on each point:

- Point 2: You correctly argued this is an API limitation, not a design problem. There's no idiomatic Koota solution for external object
  references. My proposed "solutions" (throw in factory, accept the tax, switch libraries) were weak.
- The BUILD-GUIDE argument: You pointed out that the build guide shows 23 steps where nearly every step introduces more external
  Babylon.js objects as the dominant data pattern. The nullable trait problem isn't a corner case — it's the majority of traits in the
  entire game. This reframed the Koota mismatch from "mild friction" to "fundamental incompatibility."
- Point 3: You caught me dismissing my own argument ("doesn't matter for a 3-file prototype") when the build guide explicitly maps the
  scaling path that would hit this friction at every step.

Phase 4: Library Search

You asked if there's anything better out there. I researched the JS/TS ECS ecosystem (bitECS, Becsy, tick-knock, Javelin, Thyseus). The
finding: no library handles external object references with clean type narrowing, lifecycle hooks, AND is actively maintained. Miniplex
comes closest but development has stalled.

Phase 5: Do We Need ECS At All?

You asked the direct question. The answer was no:

- The entity inventory is 2 controllers, 2 sabers, 2 trails, singletons, and ~100 pooled cubes
- The only variable-count entity (cubes) is homogeneous — just a pool
- ECS solves "many entities with varying compositions queried dynamically" — a problem this project doesn't have
- The useful patterns from ecs.ts (pipeline, event queues, teardowns) were always ECS-independent

Phase 6: Decision

Drop ECS entirely. Design a module-based architecture where domain modules own their data, expose setup/system/teardown functions, and
the composition root wires everything together. We generated and saved the architecture plan to docs/architecture-drop-ecs.md.