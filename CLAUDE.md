# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Goal: Quickly finish end-to-end prototype.

See docs/BUILD-GUIDE.md for build steps and decisions. See docs/Board.md for current tasks.

# Principles

- Follow TDA, PLOP, and Encapsulation
- Strict: cleanup, no memory leaks
- Strict: no double computations — if something can be pre-calculated, it must not be repeated
- Strict: never swallow any error — either fail hard or log, based on whether it makes sense to continue or it completely breaks app
- Strict: no spooky action at a distance

# TypeScript

- No hacks, no `as`, no `!`, etc.

# Scripts

- `pnpm dev` — Vite dev server (HTTPS via basicSsl, required for WebXR on Quest 2)
- `pnpm build` — vite build
- `pnpm preview` — preview production build
- `pnpm typecheck` — tsc --noEmit

No test runner or linter is configured.

# Architecture

VR Beat Saber clone: Babylon.js (3D/WebXR), domain modules with closures.

Flat `src/` layout — no subdirectories. Files are added as milestones progress.

## Module Pattern

No ECS. Domain modules own their data via closures. `main.ts` (composition root) wires modules together.

Each module follows the same shape:
1. `createXxx(deps...)` — setup function, builds geometry/state, returns a handle
2. Handle exposes: per-frame systems as readonly properties, domain methods, `dispose()`
3. Internal state lives in closure variables, not exported

Example (stage.ts): `createStage(scene, theme)` → `Stage` handle with `onBeat()`, `beatDecaySystem`, `dispose()`.

See `docs/architecture-drop-ecs.md` for XR wiring pattern and full module map.

## Conventions

- Domain type aliases and theme: see `src/types.ts`
- **Babylon.js imports**: Use deep imports (`@babylonjs/core/Meshes/meshBuilder`) not barrel imports.
- **Babylon.js scene**: Always pass `scene` explicitly to constructors (`new StandardMaterial(name, scene)`, `MeshBuilder.Create*(name, opts, scene)`). Never rely on Babylon's implicit "last created scene" fallback.

## Key Dependencies

- `@babylonjs/core`, `@babylonjs/loaders` — 3D engine + WebXR
- `tone`, `tonal` — audio synthesis + music theory
