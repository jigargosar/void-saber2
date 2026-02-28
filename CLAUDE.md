CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Goal: Quickly finish end-to-end prototype.

See docs/BUILD-GUIDE.md for detailed build guidance.

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

## Module Architecture

No ECS. Domain modules own their data via closures. Composition root (main.ts) wires modules together. Each module exposes: setup function → handle, system function (per-frame), teardown. Shared types in `types.ts`, system pipeline infrastructure in `pipeline.ts`.

## Conventions

- **`dispose(false, true)`**: Disposes node + materials + textures for full cleanup.
- **Trail mesh**: 120 vertices (60 samples x 2), mutable Float32Array buffers updated via `updateVerticesData`.
- **Theme**: `Hand` type alias, `Theme` interface (leftHand/rightHand colors), `handColor()` lookup — defined in `types.ts`.

## Key Dependencies

- `@babylonjs/core`, `@babylonjs/loaders` — 3D engine + WebXR
- `tone`, `tonal` — audio synthesis + music theory
