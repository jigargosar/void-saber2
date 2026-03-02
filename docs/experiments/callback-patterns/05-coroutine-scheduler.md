Coroutine Scheduler

## The Problem

Callbacks nest, re-enter, and outlive their owners.

Current codebase examples:

1. **Re-entrancy / thread blocking**: `navigate()` called from an XR squeeze callback runs `composeMusic()` + `createMusicPlayer()` synchronously inside the XR frame, hanging the browser tab. We worked around it with `setTimeout(3000)`.

2. **Teardown during execution**: `arena.onReturnToLobby(() => navigate({ page: 'lobby' }))` — `navigate` calls `teardown()` which disposes the arena, including the music player whose `onEnd` callback triggered the navigate in the first place. The call stack is: `transport.schedule → onEnd → navigate → arena.dispose → musicPlayer.dispose` — disposing the very Tone.js transport that is mid-callback.

3. **Invisible control flow**: The router's lifecycle is scattered across `.then()` chains, event listener registrations, and `Set<callback>` patterns. Reading `createRouter` requires mentally simulating callback execution order. Adding pause/resume/results sub-states to the arena will make this worse by an order of magnitude.

4. **Zombie listeners**: `lobby.onPlay(cb)` registers into a `Set`. If the lobby is disposed while the callback is still referenced elsewhere, the set is cleared but the outer reference doesn't know. No timeout, no cancellation, no way to detect a listener that will never fire.

## Core Idea

Replace callback wiring with generator functions that `yield` to wait for named signals or conditions. Callbacks shrink to one-liners that set signals. Multi-step flows become linear, readable code that reads top-to-bottom like the sequence it represents.

A **scheduler** holds a set of running coroutines and a set of pending signals. Each frame tick, it resumes coroutines whose wait conditions are satisfied. Callbacks from XR, keyboard, audio, etc. don't do work — they just call `scheduler.signal("name")` to set a flag. The actual work happens on the next tick, safely outside the callback's stack frame.

This solves the three problems:

1. **No re-entrancy**: work is always deferred to the scheduler tick, never executed inside a callback stack frame.
2. **Lifecycle-scoped**: cancelling a coroutine is just stopping iteration. All pending yields are abandoned. No stale listener cleanup needed.
3. **Readable flow**: a page lifecycle is a single function you read top-to-bottom.

## The TypeScript Primitive

```ts
// ── Types ──────────────────────────────────────────────────

type SignalName = string

/** What a coroutine yields to pause execution. */
type WaitCondition =
    | { readonly kind: 'signal'; readonly name: SignalName }
    | { readonly kind: 'any'; readonly names: readonly SignalName[] }
    | { readonly kind: 'all'; readonly names: readonly SignalName[] }
    | { readonly kind: 'frames'; readonly count: number }
    | { readonly kind: 'predicate'; readonly test: () => boolean }

/** A generator that yields wait conditions and eventually returns. */
type Coroutine = Generator<WaitCondition, void, void>

/** Function that produces a coroutine. */
type CoroutineFactory = () => Coroutine

// ── Wait helpers (called inside generators) ────────────────

function waitSignal(name: SignalName): WaitCondition {
    return { kind: 'signal', name }
}

function waitAny(...names: SignalName[]): WaitCondition {
    return { kind: 'any', names }
}

function waitAll(...names: SignalName[]): WaitCondition {
    return { kind: 'all', names }
}

function waitFrames(count: number): WaitCondition {
    return { kind: 'frames', count }
}

function waitUntil(test: () => boolean): WaitCondition {
    return { kind: 'predicate', test }
}

// ── Scheduler ──────────────────────────────────────────────

interface CoroutineHandle {
    cancel(): void
}

interface Scheduler {
    /** Fire a named signal. Consumed on next tick. */
    signal(name: SignalName): void

    /** Start a coroutine. Returns handle for cancellation. */
    start(factory: CoroutineFactory): CoroutineHandle

    /** Called once per frame from the render loop. */
    tick(): void

    /** Cancel all coroutines. */
    dispose(): void
}

function createScheduler(): Scheduler {
    const pending = new Set<SignalName>()
    const running = new Map<symbol, { coroutine: Coroutine; waiting: WaitCondition | null; framesLeft: number }>()

    function isSatisfied(condition: WaitCondition): boolean {
        switch (condition.kind) {
            case 'signal':
                return pending.has(condition.name)
            case 'any':
                return condition.names.some(n => pending.has(n))
            case 'all':
                return condition.names.every(n => pending.has(n))
            case 'frames':
                // Handled separately via framesLeft counter
                return false
            case 'predicate':
                return condition.test()
        }
    }

    function advance(id: symbol, entry: { coroutine: Coroutine; waiting: WaitCondition | null; framesLeft: number }): void {
        const result = entry.coroutine.next()
        if (result.done) {
            running.delete(id)
            return
        }
        entry.waiting = result.value
        if (result.value.kind === 'frames') {
            entry.framesLeft = result.value.count
        }
    }

    return {
        signal(name) {
            pending.add(name)
        },

        start(factory) {
            const id = Symbol()
            const entry = { coroutine: factory(), waiting: null as WaitCondition | null, framesLeft: 0 }
            running.set(id, entry)
            // Advance to first yield immediately
            advance(id, entry)
            return {
                cancel() { running.delete(id) },
            }
        },

        tick() {
            for (const [id, entry] of running) {
                if (entry.waiting === null) continue

                let ready = false

                if (entry.waiting.kind === 'frames') {
                    entry.framesLeft--
                    ready = entry.framesLeft <= 0
                } else {
                    ready = isSatisfied(entry.waiting)
                }

                if (ready) {
                    entry.waiting = null
                    advance(id, entry)
                }
            }

            // Signals are consumed after all coroutines have been checked
            pending.clear()
        },

        dispose() {
            running.clear()
            pending.clear()
        },
    }
}
```

The full implementation is ~80 lines. No dependencies.

## How Callbacks Become Signals

Every callback site in the codebase reduces to a single `scheduler.signal()` call. The callback does no work — it just notifies.

```
+-----+==============================+=====================================+
| #   | Current callback             | Becomes                             |
+-----+==============================+=====================================+
| 1   | xr.onStateChanged →          | scheduler.signal('xr-entered')      |
|     |   resolve(session)           |                                     |
+-----+------------------------------+-------------------------------------+
| 2   | onControllerAdded →          | scheduler.signal('controller-left') |
|     |   controllers.set(hand,grip) | scheduler.signal('controller-right')|
+-----+------------------------------+-------------------------------------+
| 3   | document.addEventListener    | scheduler.signal('key-escape')      |
|     |   ('keydown', ...) → check   | scheduler.signal('key-space')       |
|     |   escape                     |                                     |
+-----+------------------------------+-------------------------------------+
| 4   | squeeze component.changes    | scheduler.signal('squeeze-left')    |
|     |   .pressed?.current          | scheduler.signal('squeeze-right')   |
+-----+------------------------------+-------------------------------------+
| 5   | getDraw().schedule(onBeat,t) | scheduler.signal('beat')            |
+-----+------------------------------+-------------------------------------+
| 6   | transport.schedule(onEnd, t) | scheduler.signal('song-end')        |
+-----+------------------------------+-------------------------------------+
| 7   | lobby.onPlay(cb)             | scheduler.signal('play-pressed')    |
+-----+------------------------------+-------------------------------------+
| 8   | arena.onReturnToLobby(cb)    | scheduler.signal('return-to-lobby') |
+-----+------------------------------+-------------------------------------+
```

The raw callbacks still exist (DOM events, Babylon observables, Tone.js scheduled events) — they just become thin signal emitters instead of doing real work.

## Multi-Step Flows as Linear Code

### Router Lifecycle

Current code (scattered callbacks):

```ts
// Splash + XR entry + lobby + arena all wired through .then(), onPlay(), onReturnToLobby()
const splash = createSplash(scene)
currentSystems = splash.systems
createXRSession(scene).then((session) => {
    xrSession = session
    splash.dispose()
    navigate({ page: 'lobby' })  // navigate sets up onPlay → navigate('arena') etc.
}).catch(console.error)
```

As a coroutine:

```ts
function* routerFlow(scene: Scene, scheduler: Scheduler): Coroutine {
    // Phase 1: Splash while waiting for XR
    const splash = createSplash(scene)
    setSystems(splash.systems)

    // XR setup fires scheduler.signal('xr-entered') when IN_XR
    const xrSetup = initXR(scene, scheduler)

    yield waitSignal('xr-entered')

    const xrSession = xrSetup.getSession()
    splash.dispose()

    // Phase 2: Lobby ↔ Arena loop
    while (true) {
        // -- Lobby --
        const lobby = createLobbyPage(scene, xrSession, scheduler)
        setSystems(lobby.systems)

        yield waitSignal('play-pressed')

        const selection = lobby.getSelection()
        lobby.dispose()

        // -- Arena --
        const arena = createArenaPage(scene, theme, xrSession, selection, scheduler)
        setSystems(arena.systems)

        yield waitAny('song-end', 'return-to-lobby')

        arena.dispose()
        // Loop back to lobby
    }
}
```

Read top to bottom: splash → wait for XR → lobby → wait for play → arena → wait for end → loop. No callback nesting. No `navigate()` function. No `onPlay`/`onReturnToLobby` registration. The sequence is the code.

### Arena Lifecycle with Pause/Resume/Results

The arena's planned internal states (playing ↔ paused → results) are currently unimplemented because the callback approach would require a nested state machine with multiple listener sets. As a coroutine:

```ts
function* arenaLifecycle(
    scene: Scene,
    theme: Theme,
    xrSession: XRSession,
    selection: SongSelection,
    scheduler: Scheduler,
): Coroutine {
    const stage = createStage(scene, theme)
    const sabers = createSabers(scene, theme)

    for (const [hand, grip] of xrSession.controllers) {
        sabers.attach(hand, grip)
    }

    const composition = composeMusic(selection.seed)
    const musicPlayer = createMusicPlayer(composition, scheduler)
    await musicPlayer.start()

    // Playing state — process beats, wait for end/pause
    let gameOver = false

    while (!gameOver) {
        const event = yield waitAny('beat', 'song-end', 'key-escape', 'squeeze-left', 'squeeze-right')

        // Note: scheduler could pass which signal fired. For now, check pending set.
        // Simplified: react to what happened this tick.

        // (beat handling would be in a sub-coroutine, see below)

        // Pause requested
        if (isPauseSignal()) {
            musicPlayer.pause()

            // Paused — wait for resume, retry, or quit
            const pauseResult = yield waitAny('resume', 'retry', 'quit-to-lobby')

            if (isResume()) {
                musicPlayer.resume()
                continue
            }
            if (isRetry()) {
                // Restart arena — caller handles this by re-running the coroutine
                gameOver = true
                break
            }
            if (isQuit()) {
                gameOver = true
                break
            }
        }

        // Song ended naturally
        if (isSongEnd()) {
            gameOver = true
        }
    }

    musicPlayer.dispose()
    sabers.dispose()
    stage.dispose()
}
```

The pause/resume/results flow is visible in a single function. No state machine, no callback registration, no listener sets. The control flow IS the state machine.

### XR Controller Input

Currently, squeeze detection requires subscribing to `motionController.getComponentOfType('squeeze')` and checking `component.changes.pressed?.current` for rising edge. This is wired via Babylon's observable system. With the scheduler, the observable callback becomes a signal emitter:

```ts
// Wire once during XR setup
xr.input.onControllerAddedObservable.add((source) => {
    const hand = source.inputSource.handedness
    if (!isHand(hand) || !source.grip) return

    scheduler.signal(`controller-${hand}`)

    source.onMotionControllerInitObservable.add((mc) => {
        const squeeze = mc.getComponentOfType('squeeze')
        if (!squeeze) return
        squeeze.onButtonStateChangedObservable.add((component) => {
            if (component.changes.pressed?.current) {
                scheduler.signal(`squeeze-${hand}`)
            }
        })
    })
})
```

Consumer code:

```ts
function* waitForSqueeze(): Coroutine {
    yield waitAny('squeeze-left', 'squeeze-right')
    // Squeeze happened — do work here, safely outside the XR callback stack
}
```

### Keyboard Input

Single global listener, multiple signals:

```ts
document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'Escape': scheduler.signal('key-escape'); break
        case ' ':      scheduler.signal('key-space'); break
        case 'Enter':  scheduler.signal('key-enter'); break
    }
})
```

### Audio Beat Events

Currently `getDraw().schedule(onBeat, time)` fires the beat callback. With the scheduler:

```ts
// In music-player, during event scheduling:
const kickPart = new Part((time, e: DrumEvent) => {
    kick.triggerAttackRelease('C1', '8n', time, e.vel)
    getDraw().schedule(() => scheduler.signal('beat'), time)
}, composition.kickEvents.map(e => ({ ...e })))
```

Consumer — a sub-coroutine that handles beat pulses for the stage:

```ts
function* beatPulseLoop(stage: Stage, scheduler: Scheduler): Coroutine {
    while (true) {
        yield waitSignal('beat')
        stage.onBeat()
    }
}
// Started alongside arenaLifecycle, cancelled when arena disposes
```

### Song End

```ts
// In music-player:
transport.schedule(() => {
    stop()
    scheduler.signal('song-end')
}, composition.totalTime + TAIL_SECONDS)
```

The arena coroutine's `yield waitAny('song-end', 'key-escape', ...)` picks this up on the next tick. No dispose-during-callback — the coroutine decides when to tear down, not the callback.

### Page Navigation

Navigation is no longer a function. It's the structure of the router coroutine itself:

```ts
// This IS the navigation logic:
while (true) {
    const lobby = createLobbyPage(...)
    yield waitSignal('play-pressed')
    lobby.dispose()

    const arena = createArenaPage(...)
    yield waitAny('song-end', 'return-to-lobby')
    arena.dispose()
}
```

No `navigate()` function, no route enum, no teardown variable. The coroutine's position in the loop IS the current route.

## Teardown Safety: Coroutine Scope = Lifecycle Scope

The key safety property: a coroutine's lifetime is bounded by its parent's lifetime.

```ts
function* arenaLifecycle(...): Coroutine {
    const stage = createStage(scene, theme)
    const musicPlayer = createMusicPlayer(composition, scheduler)
    await musicPlayer.start()

    // Sub-coroutine for beat handling — lives as long as arena does
    const beatHandle = scheduler.start(function* () {
        while (true) {
            yield waitSignal('beat')
            stage.onBeat()
        }
    })

    // Wait for arena to end
    yield waitAny('song-end', 'return-to-lobby')

    // Cancel sub-coroutine — it stops immediately, no stale listeners
    beatHandle.cancel()

    // Dispose resources — nothing else is referencing them
    musicPlayer.dispose()
    stage.dispose()
}
```

When a parent coroutine ends (or is cancelled), it cancels its children. Resources are cleaned up in the coroutine body, right after the last yield. There is no separate `dispose()` function to forget to call. Teardown is part of the flow.

Compare to current code where `dispose()` must be called externally and must know about every listener, observable subscription, and DOM event handler.

## Cancellation and Timeout Handling

### Cancellation

`CoroutineHandle.cancel()` removes the coroutine from the scheduler's running set. The generator is simply abandoned — no further `.next()` calls, no finally blocks execute (unless we add explicit support).

For coroutines that need cleanup on cancellation, wrap in try/finally:

```ts
function* withCleanup(scheduler: Scheduler): Coroutine {
    const resource = acquireResource()
    try {
        yield waitSignal('done')
        // Normal completion
    } finally {
        // NOTE: if cancelled, this does NOT run unless we call .return()
        resource.release()
    }
}
```

To support `finally` blocks on cancellation, the scheduler calls `coroutine.return()` instead of just deleting the entry:

```ts
cancel() {
    const entry = running.get(id)
    if (entry) {
        entry.coroutine.return(undefined)  // Triggers finally blocks
        running.delete(id)
    }
}
```

### Timeout for Zombie Coroutines

A coroutine waiting on a signal that never fires is a zombie. Add a timeout variant:

```ts
type WaitCondition =
    | { readonly kind: 'signal'; readonly name: SignalName }
    // ... existing variants ...
    | { readonly kind: 'timeout'; readonly inner: WaitCondition; readonly maxFrames: number }

function waitWithTimeout(condition: WaitCondition, maxFrames: number): WaitCondition {
    return { kind: 'timeout', inner: condition, maxFrames }
}
```

Usage:

```ts
function* waitForXRWithTimeout(): Coroutine {
    yield waitWithTimeout(waitSignal('xr-entered'), 600)  // ~10s at 60fps
    // If XR didn't enter in time, coroutine resumes anyway
    // Caller checks state to determine if XR is available
}
```

The scheduler tracks frame count per waiting coroutine. If `maxFrames` elapses before the inner condition is satisfied, the coroutine resumes anyway. The coroutine is responsible for checking whether the condition actually fired or it was a timeout — the scheduler doesn't distinguish.

### Watchdog for Leaked Coroutines

In development, log a warning when a coroutine has been waiting longer than N seconds:

```ts
// Dev-only watchdog
const ZOMBIE_WARN_FRAMES = 3600  // 60s at 60fps

// In tick():
for (const [id, entry] of running) {
    entry.waitingFrames++
    if (entry.waitingFrames > ZOMBIE_WARN_FRAMES) {
        console.warn(`Coroutine ${String(id)} waiting for ${entry.waiting?.kind} for ${entry.waitingFrames} frames`)
    }
}
```

## Tradeoffs

### Advantages

1. **Linear readability**: Multi-step async flows read top-to-bottom. No mental simulation of callback execution order. A page lifecycle is one function, not five callbacks wired across three files.

2. **No re-entrancy**: All work happens in the scheduler tick, never inside a callback's stack frame. The XR-frame-blocking bug becomes structurally impossible — squeeze callback just sets a signal, the heavy `composeMusic()` runs next frame.

3. **No teardown-during-execution**: `arena.dispose()` called from within `onEnd` callback is impossible. The coroutine yields, then the scheduler decides to resume it next tick, then the coroutine disposes resources sequentially.

4. **Lifecycle = scope**: A coroutine's local variables ARE the page's resources. When the coroutine ends, the resources go out of scope. `dispose()` calls happen in the coroutine body, not in a separate function that must track everything.

5. **Cancellation is deletion**: No listener deregistration ceremony. Cancel a coroutine and everything it was waiting on becomes irrelevant.

6. **Sub-coroutines compose**: Beat handling is a coroutine started/cancelled by the arena coroutine. Pause overlay is another sub-coroutine. They compose without knowing about each other.

7. **Testable**: The scheduler is deterministic. Feed it signals, call tick, assert coroutine state. No real timers, no DOM, no Babylon observables needed in tests.

### Disadvantages

1. **Generator debugging is poor**: Stepping through `yield` in browser DevTools is disorienting. The call stack shows the scheduler's `advance()` function, not the logical call site. Breakpoints inside generators work but the mental model doesn't match normal function stepping. Chrome's async stack traces don't help because generators aren't Promises.

2. **Silent hangs**: A coroutine waiting for `'play-pressed'` when the signal is actually named `'play_pressed'` will wait forever. No compile-time checking of signal names (they're strings). Typos cause invisible deadlocks. The zombie watchdog catches these eventually but the feedback loop is slow.

3. **Signal name coordination**: Every signal producer and consumer must agree on string names. Currently, `onPlay(cb)` is type-checked — you can't misspell it. Replacing it with `scheduler.signal('play-pressed')` loses that type safety. Mitigated by a `SignalName` union type, but that's extra maintenance.

4. **Frame-delayed responses**: Everything is deferred to the next tick. A signal fired at the start of a frame isn't processed until `scheduler.tick()` runs. This adds one frame of latency to all event handling. For VR at 72Hz, that's ~14ms. For input responsiveness this is usually fine; for audio-visual sync it could be noticeable.

5. **Generator restrictions**: Can't `yield` inside a callback, `.forEach()`, `.map()`, or any helper function. Only the top-level generator body can yield. This forces flattening of code that might naturally use helpers. Workaround: sub-coroutines for reusable sequences.

6. **"Which signal fired?" problem**: `yield waitAny('song-end', 'key-escape')` resumes the coroutine, but the coroutine doesn't know which signal caused the resume. Need either a return channel (scheduler passes the signal name back into `.next()`) or the coroutine must query state. Both are clunky.

7. **Single scheduler = coupling point**: All signals flow through one scheduler. In the current design, pages are independent modules that don't share event infrastructure. The scheduler becomes a shared dependency, and signal names become a global namespace.

8. **Learning curve**: Generators are uncommon in game code. Contributors need to understand `yield`, iterator protocol, and the scheduler's tick semantics. The pattern is well-known in game engines (Unity coroutines, Godot yields) but unfamiliar to typical web devs.

9. **No conditional cleanup without try/finally**: If a coroutine is cancelled between "acquired resource" and "released resource", the release doesn't happen unless we use `coroutine.return()` and the generator has a `finally` block. Easy to forget.

## Implementation Cost

```
+-----+====================================+============+
| #   | Task                               | Estimate   |
+-----+====================================+============+
| 1   | createScheduler + types            | 2 hours    |
+-----+------------------------------------+------------+
| 2   | Signal wiring: keyboard, XR        | 1 hour     |
|     | observables, Tone.js callbacks     |            |
+-----+------------------------------------+------------+
| 3   | Router coroutine (replace          | 2 hours    |
|     | navigate + callback wiring)        |            |
+-----+------------------------------------+------------+
| 4   | Arena coroutine (replace           | 2 hours    |
|     | arena-page callback pattern)       |            |
+-----+------------------------------------+------------+
| 5   | Lobby coroutine (replace           | 1 hour     |
|     | lobby-page callback pattern)       |            |
+-----+------------------------------------+------------+
| 6   | Timeout + zombie watchdog          | 1 hour     |
+-----+------------------------------------+------------+
| 7   | SignalName union type + refactor   | 1 hour     |
|     | string literals                    |            |
+-----+------------------------------------+------------+
| 8   | Testing (manual VR testing +       | 2 hours    |
|     | edge cases: cancel, timeout)       |            |
+-----+------------------------------------+------------+
|     | TOTAL                              | ~12 hours  |
+-----+------------------------------------+------------+
```

Most risk is in task 3 (router rewrite) — it touches the central control flow. Tasks 2-5 can be done incrementally: wire one callback source at a time, convert one page at a time, keep the old pattern working alongside the new one during migration.
