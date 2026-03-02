Command Queue Implementation Plan

Scope: replace callback-driven page navigation with a command queue
drained once per frame. Only cross-page state transitions go through
the queue. Intra-page communication (onBeat, menu selection, saber
attach) stays direct.

# Commands

Three commands. All readonly objects in a discriminated union.

```ts
type Command =
    | { type: 'navigateToArena'; seed: Seed; difficulty: Difficulty }
    | { type: 'returnToLobby' }
    | { type: 'songEnd' }
```

`songEnd` is separate from `returnToLobby` so a results screen can be
added later without touching music-player.ts.

`beat` stays out — getDraw().schedule() already defers to rAF, no
re-entrancy risk, arena-internal.

# Queue primitive

New file: `src/command-queue.ts`

```ts
import { type Seed, type Difficulty } from './types'

type Command =
    | { readonly type: 'navigateToArena'; readonly seed: Seed; readonly difficulty: Difficulty }
    | { readonly type: 'returnToLobby' }
    | { readonly type: 'songEnd' }

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
            const batch = pending
            pending = []
            for (const command of batch) {
                handler(command)
            }
        },
    }
}
```

Buffer swap in drain: commands enqueued during handling go to next
frame's batch, not current. Prevents infinite loops.

~25 lines.

# Wiring changes per file

## src/main.ts

Route type expands to carry seed + difficulty:

```ts
// BEFORE
type Route =
    | { readonly page: 'lobby' }
    | { readonly page: 'arena' }

// AFTER
type Route =
    | { readonly page: 'lobby' }
    | { readonly page: 'arena'; readonly seed: Seed; readonly difficulty: Difficulty }
```

Router signature changes:

```ts
// BEFORE
function createRouter(scene: Scene): Router

// AFTER
function createRouter(scene: Scene, queue: CommandQueue): Router
```

Router navigate cases — no more callback wiring:

```ts
// BEFORE
case 'lobby': {
    const lobby = createLobbyPage(scene)
    currentSystems = lobby.systems
    lobby.onPlay(() => { navigate({ page: 'arena' }) })      // ← REMOVED
    teardown = () => { lobby.dispose() }
    break
}
case 'arena': {
    const arena = createArenaPage(scene, theme, xrSession)
    currentSystems = arena.systems
    arena.onReturnToLobby(() => { navigate({ page: 'lobby' }) })  // ← REMOVED
    teardown = () => { arena.dispose() }
    break
}

// AFTER
case 'lobby': {
    const lobby = createLobbyPage(scene, queue)
    currentSystems = lobby.systems
    teardown = () => { lobby.dispose() }
    break
}
case 'arena': {
    const arena = createArenaPage(scene, theme, xrSession, route.seed, route.difficulty, queue)
    currentSystems = arena.systems
    teardown = () => { arena.dispose() }
    break
}
```

Router gets handleCommand — exhaustive switch:

```ts
function handleCommand(command: Command): void {
    switch (command.type) {
        case 'navigateToArena':
            navigate({ page: 'arena', seed: command.seed, difficulty: command.difficulty })
            break
        case 'returnToLobby':
        case 'songEnd':
            navigate({ page: 'lobby' })
            break
    }
}
```

Router interface expands:

```ts
// BEFORE
interface Router {
    activeSystems(): readonly System[]
}

// AFTER
interface Router {
    activeSystems(): readonly System[]
    handleCommand(command: Command): void
}
```

main() creates queue and drains before systems:

```ts
// BEFORE
function main(): void {
    const { engine, scene } = setupEngine()
    const router = createRouter(scene)

    scene.onBeforeRenderObservable.add(() => {
        const dt = engine.getDeltaTime() / 1000
        for (const system of router.activeSystems()) {
            system(dt)
        }
    })
    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}

// AFTER
function main(): void {
    const { engine, scene } = setupEngine()
    const queue = createCommandQueue()
    const router = createRouter(scene, queue)

    scene.onBeforeRenderObservable.add(() => {
        queue.drain((command) => router.handleCommand(command))

        const dt = engine.getDeltaTime() / 1000
        for (const system of router.activeSystems()) {
            system(dt)
        }
    })
    engine.runRenderLoop(() => scene.render())
    window.addEventListener('resize', () => engine.resize())
}
```

## src/arena-page/arena-page.ts

Signature changes — receives seed, difficulty, queue:

```ts
// BEFORE
export function createArenaPage(
    scene: Scene,
    theme: Theme,
    xrSession: XRSession,
): ArenaPage

// AFTER
export function createArenaPage(
    scene: Scene,
    theme: Theme,
    xrSession: XRSession,
    seed: Seed,
    difficulty: Difficulty,
    queue: CommandQueue,
): ArenaPage
```

HARDCODED_SEED removed. Seed comes from parameter (which came from
the command, which came from the menu or lobby Escape).

returnListeners Set removed. onReturnToLobby method removed from
interface.

Escape key enqueues instead of iterating listeners:

```ts
// BEFORE
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        for (const cb of returnListeners) cb()
    }
}

// AFTER
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        queue.enqueue({ type: 'returnToLobby' })
    }
}
```

Music player wiring — queue replaces onEnd callback:

```ts
// BEFORE
const composition = composeMusic(HARDCODED_SEED)
const musicPlayer = createMusicPlayer(
    composition,
    () => { stage.onBeat() },
    () => { for (const cb of returnListeners) cb() },
)

// AFTER
const composition = composeMusic(seed)
const musicPlayer = createMusicPlayer(
    composition,
    () => { stage.onBeat() },
    queue,
)
```

Interface shrinks:

```ts
// BEFORE
export interface ArenaPage {
    readonly systems: readonly System[]
    onReturnToLobby(callback: () => void): void
    dispose: Teardown
}

// AFTER
export interface ArenaPage {
    readonly systems: readonly System[]
    dispose: Teardown
}
```

dispose() shrinks — no returnListeners.clear():

```ts
// BEFORE
dispose() {
    document.removeEventListener('keydown', onKey)
    returnListeners.clear()
    musicPlayer.dispose()
    for (const [hand] of xrSession.controllers) sabers.detach(hand)
    sabers.dispose()
    stage.dispose()
}

// AFTER
dispose() {
    document.removeEventListener('keydown', onKey)
    musicPlayer.dispose()
    for (const [hand] of xrSession.controllers) sabers.detach(hand)
    sabers.dispose()
    stage.dispose()
}
```

## src/lobby-page/lobby-page.ts

Signature changes:

```ts
// BEFORE
export function createLobbyPage(scene: Scene): LobbyPage

// AFTER
export function createLobbyPage(scene: Scene, queue: CommandQueue): LobbyPage
```

playListeners Set removed. onPlay method removed from interface.

Escape key enqueues instead of iterating listeners:

```ts
// BEFORE
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        for (const cb of playListeners) cb()
    }
}

// AFTER
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        queue.enqueue({ type: 'navigateToArena', seed: 42 as Seed, difficulty: 'medium' })
    }
}
```

Hardcoded seed+difficulty here is temporary — when menu is re-enabled,
menu will enqueue navigateToArena with real selection and lobby Escape
won't navigate at all (or will be remapped).

Interface shrinks:

```ts
// BEFORE
export interface LobbyPage {
    readonly systems: readonly System[]
    onPlay(callback: () => void): void
    dispose: Teardown
}

// AFTER
export interface LobbyPage {
    readonly systems: readonly System[]
    dispose: Teardown
}
```

dispose() shrinks — no playListeners.clear():

```ts
// BEFORE
dispose() {
    document.removeEventListener('keydown', onKey)
    playListeners.clear()
    env.dispose()
}

// AFTER
dispose() {
    document.removeEventListener('keydown', onKey)
    env.dispose()
}
```

## src/music/music-player.ts

Signature changes — queue replaces onEnd callback:

```ts
// BEFORE
export function createMusicPlayer(
    composition: MusicComposition,
    onBeat: () => void,
    onEnd: () => void,
): MusicPlayer

// AFTER
export function createMusicPlayer(
    composition: MusicComposition,
    onBeat: () => void,
    queue: CommandQueue,
): MusicPlayer
```

onBeat stays as direct callback — unchanged in kick part.

Auto-stop enqueues instead of calling onEnd:

```ts
// BEFORE
transport.schedule(() => {
    stop()
    onEnd()
}, composition.totalTime + TAIL_SECONDS)

// AFTER
transport.schedule(() => {
    stop()
    queue.enqueue({ type: 'songEnd' })
}, composition.totalTime + TAIL_SECONDS)
```

Everything else in music-player.ts is unchanged.

## src/lobby-page/menu.ts — NOT TOUCHED

menu.ts import is commented out in lobby-page.ts. When re-enabled,
menu will receive queue and enqueue navigateToArena directly from
the play button click. The playListeners Set and onPlay method in
menu.ts will be replaced at that time.

# What doesn't change

- src/types.ts — no new types needed there
- src/game-state.ts — orthogonal, not wired yet
- src/xr-session.ts — no callbacks to convert
- src/splash-page/splash.ts — no user interaction
- src/arena-page/stage.ts — onBeat stays direct
- src/arena-page/saber.ts, trail.ts — per-frame systems
- src/music/music-composer.ts, beat-timeline.ts — pure functions

# Execution order

1. Create src/command-queue.ts
2. Modify src/main.ts (Route type, createRouter signature, drain,
   handleCommand, remove callback wiring)
3. Modify src/arena-page/arena-page.ts (signature, remove listeners,
   enqueue)
4. Modify src/lobby-page/lobby-page.ts (signature, remove listeners,
   enqueue)
5. Modify src/music/music-player.ts (signature, enqueue songEnd)
6. Run typecheck

Steps 3-5 are independent of each other but all depend on 1+2.

# Frame cycle after implementation

```
User presses Escape in arena
  → queue.enqueue({ type: 'returnToLobby' })
  → keydown handler returns immediately

Next frame:
  → scene.onBeforeRenderObservable fires
    → queue.drain()
      → router.handleCommand({ type: 'returnToLobby' })
        → navigate({ page: 'lobby' })
          → arena.dispose()       ← safe: no callback on the stack
          → createLobbyPage(scene, queue)
    → run lobby.systems
  → scene.render()
```

No callback is on the call stack when dispose runs. Re-entrancy
eliminated by construction.
