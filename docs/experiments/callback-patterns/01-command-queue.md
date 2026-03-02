Command Queue

## The Problem

Every callback in the app can fire at arbitrary times, from arbitrary contexts:

1. **XR controller input** — fires inside Babylon's XR observable, mid-frame
2. **Keyboard input** — fires from the browser's `keydown` event, between frames
3. **Audio beat events** — fires from Tone.js's `Draw.schedule`, inside `requestAnimationFrame` but outside our game loop
4. **Audio song-end** — fires from Tone.js's transport scheduler, potentially during audio worklet processing
5. **GUI clicks** — fires from Babylon GUI's pointer observable, mid-frame during scene picking

Today, these callbacks directly mutate state or trigger navigation:

```ts
// arena-page.ts — audio song-end fires returnToLobby listeners
const musicPlayer = createMusicPlayer(
    composition,
    () => { stage.onBeat() },
    () => { for (const cb of returnListeners) cb() },  // <-- fires navigate()
)

// main.ts — navigate() synchronously tears down the current page
arena.onReturnToLobby(() => { navigate({ page: 'lobby' }) })

// The chain: Tone.js transport → onEnd callback → returnListeners → navigate()
//   → arena.dispose() → musicPlayer.dispose() — tearing down the thing that called us
```

Three bugs emerge from this:

1. **Re-entrancy**: `navigate()` calls `teardown()` which disposes the page that triggered the navigation. The call stack unwinds through disposed objects.
2. **Teardown-during-execution**: `musicPlayer.dispose()` runs while we're still inside the transport's scheduled callback. Tone.js doesn't expect its parts to be disposed mid-callback.
3. **Frame blocking**: `composeMusic()` + `createMusicPlayer()` are heavy synchronous work. When called from inside an XR frame callback (squeeze → navigate → create page), they block the XR frame and the browser kills the session.

## Core Idea

Callbacks never execute logic. They enqueue a typed command object into a queue. The game loop drains the queue once per frame, at a safe point, and executes each command sequentially.

```
[callback fires] → queue.enqueue({ type: 'navigateTo', page: 'lobby' })
                         │
                         ▼
[game loop]       → queue.drain()  →  execute 'navigateTo'  →  teardown + create page
```

Every callback becomes a one-liner. All side effects happen in a single, predictable location: the game loop's drain step.

## The TypeScript Primitive

```ts
// src/command-queue.ts

import { type Seed, type Difficulty } from './types'

// ── Command union ─────────────────────────────────────────

type NavigateToLobby = { readonly type: 'navigateToLobby' }
type NavigateToArena = { readonly type: 'navigateToArena'; readonly seed: Seed; readonly difficulty: Difficulty }
type PauseGame       = { readonly type: 'pauseGame' }
type ResumeGame      = { readonly type: 'resumeGame' }
type ReturnToLobby   = { readonly type: 'returnToLobby' }
type Beat            = { readonly type: 'beat' }
type SongEnd         = { readonly type: 'songEnd' }

type Command =
    | NavigateToLobby
    | NavigateToArena
    | PauseGame
    | ResumeGame
    | ReturnToLobby
    | Beat
    | SongEnd

// ── Queue ─────────────────────────────────────────────────

interface CommandQueue {
    enqueue(command: Command): void
    drain(handler: (command: Command) => void): void
}

function createCommandQueue(): CommandQueue {
    let pending: Command[] = []

    return {
        enqueue(command) {
            pending.push(command)
        },

        drain(handler) {
            // Swap buffer so commands enqueued during handling go to next frame
            const batch = pending
            pending = []
            for (const command of batch) {
                handler(command)
            }
        },
    }
}
```

Key detail: `drain` swaps the buffer before iterating. If a handler enqueues new commands (e.g., `songEnd` handler enqueues `returnToLobby`), those land in the *next* frame's batch, not the current one. This eliminates infinite loops and makes ordering predictable.

The `Command` union is the single place to see every intent in the app. Adding a new command is: add a variant, add a case in the handler.

## How Callbacks Become One-Liners

### XR Controller Input (squeeze to return to lobby)

Before:
```ts
// Inside XR observable callback
xr.input.onControllerAddedObservable.add((source) => {
    const squeeze = motionController.getComponentOfType('squeeze')
    squeeze.onButtonStateChangedObservable.add(() => {
        if (squeeze.changes.pressed?.current) {
            for (const cb of returnListeners) cb()  // triggers navigate(), heavy work
        }
    })
})
```

After:
```ts
squeeze.onButtonStateChangedObservable.add(() => {
    if (squeeze.changes.pressed?.current) {
        queue.enqueue({ type: 'returnToLobby' })
    }
})
```

### Keyboard Input

Before:
```ts
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        for (const cb of returnListeners) cb()  // triggers navigate()
    }
}
document.addEventListener('keydown', onKey)
```

After:
```ts
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        queue.enqueue({ type: 'returnToLobby' })
    }
}
document.addEventListener('keydown', onKey)
```

### Audio Beat Events

Before:
```ts
// Inside Tone.js Part callback
const kickPart = new Part((time, e: DrumEvent) => {
    kick.triggerAttackRelease('C1', '8n', time, e.vel)
    getDraw().schedule(onBeat, time)  // onBeat directly calls stage.onBeat()
}, ...)
```

After:
```ts
const kickPart = new Part((time, e: DrumEvent) => {
    kick.triggerAttackRelease('C1', '8n', time, e.vel)
    getDraw().schedule(() => queue.enqueue({ type: 'beat' }), time)
}, ...)
```

Note: `getDraw().schedule` already defers to `requestAnimationFrame`, so the enqueue happens on the main thread. The game loop drain happens later in the same frame, guaranteeing the beat is processed after Babylon's scene evaluation.

### Audio Song-End

Before:
```ts
transport.schedule(() => {
    stop()
    onEnd()  // fires returnListeners → navigate() → dispose — re-entrancy
}, composition.totalTime + TAIL_SECONDS)
```

After:
```ts
transport.schedule(() => {
    stop()
    queue.enqueue({ type: 'songEnd' })
}, composition.totalTime + TAIL_SECONDS)
```

The `onEnd` callback no longer exists. The queue handler maps `songEnd` to the appropriate action (show results, navigate, etc.).

### Menu Play Button / Page Navigation

Before:
```ts
// menu.ts
playBtn.onPointerClickObservable.add(() => {
    const song = SONGS[selectedSongIdx]
    const diff = DIFFICULTY_TO_GAME[DIFFICULTIES[selectedDiffIdx].key]
    for (const cb of playListeners) cb(song.seed, diff)
})

// lobby-page.ts → main.ts
lobby.onPlay(() => { navigate({ page: 'arena' }) })
```

After:
```ts
// menu.ts
playBtn.onPointerClickObservable.add(() => {
    const song = SONGS[selectedSongIdx]
    const diff = DIFFICULTY_TO_GAME[DIFFICULTIES[selectedDiffIdx].key]
    queue.enqueue({ type: 'navigateToArena', seed: song.seed, difficulty: diff })
})
```

The `onPlay` callback chain disappears. The menu enqueues directly.

## How the Game Loop Drains Commands

```ts
// main.ts

function main(): void {
    const { engine, scene } = setupEngine()
    const queue = createCommandQueue()
    const router = createRouter(scene, queue)

    scene.onBeforeRenderObservable.add(() => {
        // 1. Drain commands first — all state transitions happen here
        queue.drain((command) => router.handleCommand(command))

        // 2. Then run per-frame systems on the (possibly new) page
        const dt = engine.getDeltaTime() / 1000
        for (const system of router.activeSystems()) {
            system(dt)
        }
    })

    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}
```

The drain happens *before* systems run. This means:

1. A `navigateToArena` command tears down lobby and creates arena
2. The same frame's system loop runs arena's systems (not the disposed lobby's)
3. No stale references, no disposed-object access

## Router Command Handler

```ts
function createRouter(scene: Scene, queue: CommandQueue): Router {
    let currentSystems: readonly System[] = []
    let teardown: Teardown = () => {}

    function navigate(route: Route): void {
        teardown()

        switch (route.page) {
            case 'lobby': {
                const lobby = createLobbyPage(scene, queue)
                currentSystems = lobby.systems
                teardown = () => { lobby.dispose() }
                break
            }
            case 'arena': {
                const arena = createArenaPage(scene, theme, xrSession, queue)
                currentSystems = arena.systems
                teardown = () => { arena.dispose() }
                break
            }
        }
    }

    function handleCommand(command: Command): void {
        switch (command.type) {
            case 'navigateToLobby':
                navigate({ page: 'lobby' })
                break
            case 'navigateToArena':
                navigate({ page: 'arena', seed: command.seed, difficulty: command.difficulty })
                break
            case 'returnToLobby':
                navigate({ page: 'lobby' })
                break
            case 'songEnd':
                // Future: show results screen. For now, return to lobby.
                navigate({ page: 'lobby' })
                break
            case 'beat':
                // Delegate to current page's beat handler (if arena)
                // This requires the router to know about page internals,
                // or the page registers its own drain handler — see Tradeoffs.
                break
            case 'pauseGame':
            case 'resumeGame':
                // Future: delegate to arena's internal state
                break
        }
    }

    return { activeSystems: () => currentSystems, handleCommand }
}
```

## Teardown Safety

The re-entrancy problem is structurally eliminated. Here's the before/after call stack:

**Before** (re-entrant):
```
Tone.js transport callback
  → onEnd()
    → returnListeners.forEach(cb => cb())
      → navigate({ page: 'lobby' })
        → arena.dispose()
          → musicPlayer.dispose()   ← disposing while inside transport callback
            → transport.cancel()    ← canceling the transport that called us
```

**After** (deferred):
```
Tone.js transport callback
  → queue.enqueue({ type: 'songEnd' })
  → callback returns cleanly

... next frame ...

game loop drain
  → handleCommand({ type: 'songEnd' })
    → navigate({ page: 'lobby' })
      → arena.dispose()
        → musicPlayer.dispose()   ← safe: transport callback finished long ago
```

The callback's stack is completely unwound before any disposal happens. Tone.js, Babylon's XR system, and the browser's event system all return cleanly from their callbacks. The heavy work (page creation, music composition) runs in the game loop, not inside any framework callback.

**Stale command safety**: Commands enqueued by a disposed page are harmless. When arena is torn down and lobby is created, any leftover `beat` or `songEnd` commands from the previous arena will still drain next frame. The handler either ignores them (beat has no meaning in lobby) or they're idempotent (navigating to lobby when already in lobby is a no-op). The handler can also check current page state and discard irrelevant commands.

## Tradeoffs

### Pros

1. **Eliminates re-entrancy by construction** — callbacks can never trigger synchronous disposal of their own context. This is the primary motivation.
2. **Single execution point** — all state transitions happen in one place (`drain`), making the app's behavior predictable and debuggable. Console-log the drain and you see every intent in order.
3. **Frame-aligned** — all side effects happen at a known point in the frame. No mid-frame state mutations from surprise callbacks.
4. **Removes callback listener boilerplate** — pages no longer need `onPlay(cb)`, `onReturnToLobby(cb)`, `Set<callback>` patterns, or `listeners.clear()` in dispose. Commands go directly to the queue.
5. **Typed intent catalog** — the `Command` union is a manifest of every action the app can take. New actions require explicit union members and handler cases.
6. **Testable** — enqueue commands, call drain, assert state. No need to simulate XR frames or audio transport.

### Cons

1. **One-frame latency** — commands execute next frame, not immediately. At 72-90Hz VR frame rate, this is 11-14ms. Imperceptible for navigation and beats. Could matter for precise input timing (e.g., saber collision scoring), though those are per-frame systems anyway, not callback-driven.
2. **Global command type** — the `Command` union is a single flat discriminated union. Every command is visible to the router even if it only applies to one page. As commands grow, the union grows. Mitigation: keep navigation commands global, let pages handle page-specific commands via a sub-queue or by having the router delegate.
3. **Indirection** — the callback site and the execution site are separated. Reading a callback, you can't see what it *does* without finding the handler. This is also true of event buses, but the queue at least has a typed union you can Cmd+Click.
4. **Beat commands are high-frequency** — at 128 BPM with kick on every beat, that's ~2 commands/second. Trivial. But if we add per-note events for 16th-note arpeggio patterns, it could be 8-16/second. Still trivial for an array push + drain, but worth noting the queue isn't free.
5. **Queue requires threading through** — the `queue` must be passed to every module that enqueues. Pages, menu, music player all need it. This is explicit dependency injection (good) but adds a parameter to every `create*` function (noisy).
6. **Page-specific commands leak into global scope** — `beat` only matters to arena. Handling it in the router means the router knows about arena internals. Alternatives: arena registers its own drain callback, or the router delegates `beat` to the current page via a page-level `handleCommand` method. Both add complexity.

## Implementation Cost

### New files

```
+-----+============================+=======+
| #   | File                       | Lines |
+-----+============================+=======+
| 1   | src/command-queue.ts       | ~40   |
+-----+----------------------------+-------+
```

### Modified files

```
+-----+============================+=================+============================+
| #   | File                       | Change size     | What changes               |
+-----+============================+=================+============================+
| 1   | src/main.ts                | ~15 lines       | Create queue, pass to      |
|     |                            |                 | router, add drain to loop  |
+-----+----------------------------+-----------------+----------------------------+
| 2   | src/arena-page/            | ~10 lines       | Accept queue param,        |
|     | arena-page.ts              |                 | remove onReturnToLobby,    |
|     |                            |                 | remove returnListeners     |
+-----+----------------------------+-----------------+----------------------------+
| 3   | src/lobby-page/            | ~8 lines        | Accept queue param,        |
|     | lobby-page.ts              |                 | remove onPlay,             |
|     |                            |                 | remove playListeners       |
+-----+----------------------------+-----------------+----------------------------+
| 4   | src/lobby-page/menu.ts     | ~8 lines        | Accept queue param,        |
|     |                            |                 | enqueue navigateToArena    |
|     |                            |                 | instead of playListeners   |
+-----+----------------------------+-----------------+----------------------------+
| 5   | src/music/                 | ~6 lines        | Accept queue param,        |
|     | music-player.ts            |                 | replace onBeat/onEnd       |
|     |                            |                 | callbacks with enqueue     |
+-----+----------------------------+-----------------+----------------------------+
```

**Total**: ~1 new file (~40 lines), ~5 files modified (~47 lines changed). Net line delta is close to zero — callback listener infrastructure (`Set<cb>`, `onPlay`, `onReturnToLobby`, `listeners.clear()`) is removed as queue enqueue calls are added.

### What doesn't change

- `xr-session.ts` — stays as-is. Squeeze handling moves to whoever wires the XR observable to the queue (the page or the router).
- `game-state.ts` — the state machine is orthogonal. Commands could drive state transitions, but that's a separate decision.
- `stage.ts`, `saber.ts`, `trail.ts` — per-frame systems, no callbacks to convert.
- `music-composer.ts`, `beat-timeline.ts` — pure functions, no callbacks.
- `splash-page/splash.ts` — no user interaction, no callbacks.
