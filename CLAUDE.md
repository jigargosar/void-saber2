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

VR Beat Saber clone: Babylon.js (3D/WebXR) + Koota (ECS).

Flat `src/` layout — no subdirectories. Files are added as milestones progress.

## ECS (Koota)

Direct Koota API, no wrapper layer. Full API reference: `docs/reference/Koota-README.md`. Ignore all React APIs (`koota/react`, hooks, WorldProvider) — this is a vanilla Babylon.js project.

## Conventions

- **`dispose(false, true)`**: Disposes node + materials + textures for full cleanup.
- **Trail mesh**: 120 vertices (60 samples x 2), mutable Float32Array buffers updated via `updateVerticesData`.
- **Theme**: `Hand` type alias, `Theme` interface (leftHand/rightHand colors), `handColor()` lookup.

## Key Dependencies

- `@babylonjs/core`, `@babylonjs/loaders` — 3D engine + WebXR
- `koota` — ECS
- `tone`, `tonal` — audio synthesis + music theory
