Pattern 02 — Deferred Event Bus

## Problem

The current codebase has multiple callback chains that fire synchronously from
contexts where heavy work is unsafe:

1. **XR controller squeeze** fires inside Babylon's XR observable callback.
   Calling `navigate()` synchronously from there runs `composeMusic()` +
   `createMusicPlayer()` + full page teardown/setup within the XR frame,
   blocking the browser and hanging the tab.

2. **Tone.js `onEnd`** fires from the audio transport's scheduler. The callback
   runs `for (const cb of returnListeners) cb()`, which chains through the
   router into `navigate()`, which tears down the arena (including the
   MusicPlayer that is currently firing the callback) and creates the lobby.
   Teardown-during-execution.

3. **Keyboard events** fire from the DOM event loop. The `keydown` handler
   calls `navigate()` synchronously, which disposes the current page (including
   removing the very `keydown` listener being invoked).

4. **`onBeat` from Tone.js** fires via `getDraw().schedule()`, which runs on
   requestAnimationFrame but is not aligned with the Babylon render loop. If
   a beat callback triggers state changes, those changes happen at an
   unpredictable point relative to the frame's system updates.

All four share the same root cause: a callback invokes side effects
immediately, and the call stack includes code that assumes it is still in
control of objects being destroyed or mutated.

## Core Idea

Replace direct callback invocation with a typed publish/subscribe bus where
`emit()` never invokes subscribers. Instead, it pushes events into a buffer.
A single `flush()` call in the render loop drains the buffer and delivers
events to subscribers. All side effects happen at a known, safe point in the
frame.

```
  XR callback ──► emit('squeeze', 'left')  ──┐
  Tone onBeat ──► emit('beat', beatInfo)   ──┤
  Tone onEnd  ──► emit('songEnd')          ──┼──► buffer
  keydown     ──► emit('keyEscape')        ──┤
  menu click  ──► emit('play', selection)  ──┘
                                               │
  render loop: ────────────────────────────────┘
    flush() → deliver all buffered events to subscribers
    run systems(dt)
    scene.render()
```

No subscriber ever runs inside an external callback. No teardown-during-
execution. No blocking an XR frame with heavy sync work.

## The TypeScript Primitive

```ts
// ── Topic definition (one per event kind) ───────────────────

type TopicMap = {
    squeeze:     Hand
    triggerDown: Hand
    keyEscape:   undefined
    keySpace:    undefined
    beat:        undefined
    songEnd:     undefined
    play:        { seed: Seed; difficulty: Difficulty }
    navigate:    Route
}

// ── Event bus ───────────────────────────────────────────────

type Subscriber<T> = (payload: T) => void

interface EventBus {
    emit<K extends keyof TopicMap>(topic: K, payload: TopicMap[K]): void
    on<K extends keyof TopicMap>(topic: K, handler: Subscriber<TopicMap[K]>): Teardown
    flush(): void
    dispose(): void
}

function createEventBus(): EventBus {
    // Each topic has its own subscriber set and pending event queue
    type TopicState<T> = {
        readonly subscribers: Set<Subscriber<T>>
        readonly pending: T[]
    }

    // One TopicState per key, created lazily
    const topics = new Map<keyof TopicMap, TopicState<unknown>>()

    function getTopic<K extends keyof TopicMap>(key: K): TopicState<TopicMap[K]> {
        let topic = topics.get(key) as TopicState<TopicMap[K]> | undefined
        if (!topic) {
            topic = { subscribers: new Set(), pending: [] }
            topics.set(key, topic as TopicState<unknown>)
        }
        return topic
    }

    return {
        emit<K extends keyof TopicMap>(key: K, payload: TopicMap[K]): void {
            const topic = getTopic(key)
            topic.pending.push(payload)
        },

        on<K extends keyof TopicMap>(key: K, handler: Subscriber<TopicMap[K]>): Teardown {
            const topic = getTopic(key)
            topic.subscribers.add(handler)
            return () => { topic.subscribers.delete(handler) }
        },

        flush(): void {
            // Snapshot topic keys to avoid issues if handlers cause new
            // topics to be created during iteration
            for (const [, topic] of topics) {
                const t = topic as TopicState<unknown>
                if (t.pending.length === 0) continue

                // Drain the queue — take a snapshot so events emitted
                // during delivery are deferred to the NEXT flush
                const batch = t.pending.splice(0)
                for (const payload of batch) {
                    for (const handler of t.subscribers) {
                        handler(payload)
                    }
                }
            }
        },

        dispose(): void {
            for (const [, topic] of topics) {
                (topic as TopicState<unknown>).subscribers.clear()
                ;(topic as TopicState<unknown>).pending.length = 0
            }
            topics.clear()
        },
    }
}
```

Key properties:

- **`emit()` is O(1)**: push to array, no subscriber invocation. Safe to call
  from XR callbacks, audio callbacks, DOM handlers, anywhere.
- **`flush()` is synchronous**: runs once per frame, in the render loop, before
  systems. All events delivered in insertion order within each topic.
- **Re-entrancy safe**: if a handler calls `emit()` during `flush()`, the new
  event goes into the pending array *after* the splice snapshot. It will be
  delivered on the next frame's flush, not during the current one.
- **`on()` returns `Teardown`**: standard unsubscribe. Callers store it and
  call during their own dispose.

## How Every Callback Becomes an emit() Call

Each external event source gets a thin adapter that replaces direct callback
invocation with `bus.emit()`.

### XR Controller Input

Before (current code, from xr-session.ts context + arena-page.ts):
```ts
// Squeeze fires navigate() synchronously inside XR observable → hangs tab
arena.onReturnToLobby(() => { navigate({ page: 'lobby' }) })
```

After:
```ts
// xr-session.ts — fire-and-forget emit, no business logic
xr.input.onControllerAddedObservable.add((source) => {
    const hand = source.inputSource.handedness
    if (!isHand(hand)) return

    source.onMotionControllerInitObservable.add((controller) => {
        const squeeze = controller.getComponentOfType(
            WebXRControllerComponent.SQUEEZE_TYPE,
        )
        if (!squeeze) return

        squeeze.onButtonStateChangedObservable.add((component) => {
            if (component.changes.pressed?.current) {
                bus.emit('squeeze', hand)
            }
        })
    })
})
```

The XR observable now does zero work beyond a single `emit()`. The actual
response (navigate, toggle pause, etc.) is a subscriber registered elsewhere,
and it runs during `flush()` in the render loop.

### Keyboard Input

Before:
```ts
// arena-page.ts
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        for (const cb of returnListeners) cb()  // → navigate() → teardown
    }
}
document.addEventListener('keydown', onKey)
```

After:
```ts
// Keyboard adapter — registered once, lives for app lifetime
function wireKeyboard(bus: EventBus): Teardown {
    const handler = (e: KeyboardEvent) => {
        switch (e.key) {
            case 'Escape': bus.emit('keyEscape', undefined); break
            case ' ':      bus.emit('keySpace', undefined);  break
        }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
}
```

No page-specific logic. The keyboard adapter doesn't know about lobby or
arena. Pages subscribe to `keyEscape` during their lifetime and unsubscribe
on dispose.

### Audio Beat Events

Before (music-player.ts):
```ts
// Inside Tone.Part callback for kick events:
getDraw().schedule(onBeat, time)
```

After:
```ts
getDraw().schedule(() => bus.emit('beat', undefined), time)
```

The stage's `onBeat()` method becomes a subscriber:
```ts
const unsub = bus.on('beat', () => stage.onBeat())
// ...in dispose:
unsub()
```

### Audio Song End

Before (music-player.ts):
```ts
transport.schedule(() => {
    stop()
    onEnd()  // → returnListeners → navigate() → arena.dispose() mid-callback
}, composition.totalTime + TAIL_SECONDS)
```

After:
```ts
transport.schedule(() => {
    stop()
    bus.emit('songEnd', undefined)
}, composition.totalTime + TAIL_SECONDS)
```

The router subscribes to `songEnd` and handles navigation:
```ts
bus.on('songEnd', () => navigate({ page: 'lobby' }))
```

When `flush()` delivers `songEnd`, the arena still exists. `navigate()` tears
it down cleanly — outside the Tone.js transport callback, outside the
MusicPlayer's own stack frame.

### Page Navigation

Before (main.ts):
```ts
lobby.onPlay(() => { navigate({ page: 'arena' }) })
arena.onReturnToLobby(() => { navigate({ page: 'lobby' }) })
```

After — pages no longer expose `onPlay`/`onReturnToLobby` callbacks. They
emit topics:
```ts
// lobby-page.ts — when user clicks play:
bus.emit('play', { seed: selectedSeed, difficulty })

// arena-page.ts — wired from squeeze/escape/songEnd subscribers:
bus.on('squeeze', () => bus.emit('navigate', { page: 'lobby' }))
bus.on('keyEscape', () => bus.emit('navigate', { page: 'lobby' }))
bus.on('songEnd', () => bus.emit('navigate', { page: 'lobby' }))
```

Router subscribes to `navigate` and `play`:
```ts
bus.on('play', (selection) => {
    navigate({ page: 'arena', seed: selection.seed, difficulty: selection.difficulty })
})
bus.on('navigate', (route) => navigate(route))
```

## Subscriber Registration and Unsubscription Safety

### Registration

Subscribers register via `bus.on(topic, handler)`, which returns a `Teardown`
function. The pattern:

```ts
function createArenaPage(scene: Scene, theme: Theme, bus: EventBus): ArenaPage {
    const stage = createStage(scene, theme)
    const teardowns: Teardown[] = []

    teardowns.push(bus.on('beat', () => stage.onBeat()))
    teardowns.push(bus.on('squeeze', () => bus.emit('navigate', { page: 'lobby' })))
    teardowns.push(bus.on('keyEscape', () => bus.emit('navigate', { page: 'lobby' })))

    return {
        systems: [stage.beatDecaySystem],
        dispose() {
            for (const unsub of teardowns) unsub()
            stage.dispose()
        },
    }
}
```

### Unsubscription During flush()

A handler removed during the current `flush()` iteration may or may not have
already been called for the current batch — this depends on Set iteration
order (insertion order in JS). Two options:

1. **Accept it** (simplest). A handler called once after unsubscription is
   harmless in this codebase — all handlers guard against disposed state or
   are side-effect-free.

2. **Snapshot subscribers** before iterating. Replace the inner loop:
   ```ts
   const handlers = [...t.subscribers]
   for (const handler of handlers) {
       if (t.subscribers.has(handler)) {
           handler(payload)
       }
   }
   ```
   This guarantees a removed handler is never called, at the cost of an array
   allocation per topic per flush. For the small number of subscribers in this
   app (single digits per topic), either approach works.

Recommendation: start with option 1. If a bug manifests from stale delivery,
switch to option 2 for the affected topic.

### Registration During flush()

If a handler calls `bus.on()` during `flush()`, the new handler is added to
the Set. Whether it fires for remaining events in the current batch depends
on Set insertion order relative to the current iterator position. In practice,
newly added handlers fire on the *next* flush, because they're appended after
the current iteration cursor. This is the desired behavior — no special
handling needed.

## Teardown Safety: How Deferred Dispatch Prevents Re-Entrancy

The current re-entrancy problem, step by step:

```
1. Tone.js transport fires scheduled callback
2.   → onEnd()
3.     → returnListeners.forEach(cb => cb())
4.       → navigate({ page: 'lobby' })
5.         → teardown()       // arena.dispose()
6.           → musicPlayer.dispose()
7.             → transport.stop(), transport.cancel()
8.             → synths.dispose()
9.           → stage.dispose()
10.        → createLobbyPage()  // new page setup
11.   → [returning to Tone.js internals with disposed objects on the stack]
```

Steps 6-8 destroy the MusicPlayer whose transport is currently executing step
1. Tone.js may touch disposed audio nodes after the callback returns. This is
undefined behavior.

With the deferred bus:

```
1. Tone.js transport fires scheduled callback
2.   → bus.emit('songEnd', undefined)  // push to array, return immediately
3. [Tone.js callback returns cleanly — nothing was disposed]
4. ... next requestAnimationFrame ...
5. flush()
6.   → songEnd handler fires
7.     → navigate({ page: 'lobby' })
8.       → teardown()       // arena.dispose()
9.         → musicPlayer.dispose()  // safe — not inside transport callback
10.        → stage.dispose()
11.      → createLobbyPage()
```

The crucial difference: step 9 runs on a subsequent frame, long after the
Tone.js transport callback (step 1-3) has returned. No stack frame from
Tone.js is on the call stack when MusicPlayer is disposed.

The same applies to XR squeeze: `bus.emit('squeeze', hand)` returns
immediately within the XR observable callback. The heavy `navigate()` call
runs during `flush()`, outside the XR frame processing.

## Render Loop Integration

```ts
function main(): void {
    const { engine, scene } = setupEngine()
    const bus = createEventBus()

    const disposeKeyboard = wireKeyboard(bus)
    const router = createRouter(scene, bus)

    scene.onBeforeRenderObservable.add(() => {
        bus.flush()  // deliver all buffered events FIRST

        const dt = engine.getDeltaTime() / 1000
        for (const system of router.activeSystems()) {
            system(dt)
        }
    })

    engine.runRenderLoop(() => scene.render())

    window.addEventListener('resize', () => engine.resize())
}
```

`flush()` runs before systems. This means:

- Beat events are delivered, stage state is updated, then `beatDecaySystem`
  runs with the updated state in the same frame. No one-frame lag.
- Navigation events tear down the old page and create the new page before
  systems run, so `router.activeSystems()` returns the new page's systems.
- Events emitted by handlers during flush (e.g., `squeeze` handler emits
  `navigate`) are buffered for the next frame. This prevents infinite loops
  and keeps the frame's work bounded.

## Event Bus Threading Through the App

The bus is created in `main()` and passed as a dependency:

```ts
// main.ts
const bus = createEventBus()
const router = createRouter(scene, bus)

// createRouter passes bus to pages:
const arena = createArenaPage(scene, theme, bus)

// createArenaPage passes bus to MusicPlayer:
const musicPlayer = createMusicPlayer(composition, bus)
```

Each module receives the bus as a parameter. No global singleton, no import-
time side effects. The bus is an explicit dependency — visible in function
signatures.

## Tradeoffs

### Pros

1. **Eliminates re-entrancy**: all side effects happen at a single known point
   in the frame. No callback can trigger teardown of objects on its own stack.

2. **Eliminates XR frame blocking**: XR callbacks do O(1) work (push to array).
   Heavy page transitions happen in the render loop.

3. **Decouples event sources from handlers**: keyboard adapter doesn't know
   about pages. MusicPlayer doesn't know about navigation. Wiring is explicit
   in the router.

4. **Predictable execution order**: events are delivered in emit order within
   each topic. All delivery happens before systems run. Easier to reason about
   than scattered callbacks at arbitrary points in the frame.

5. **Clean teardown**: pages unsubscribe in their `dispose()`. No dangling
   callbacks. The bus itself is disposed when the app shuts down.

6. **Low implementation cost**: the primitive is ~50 lines. Adapters are thin
   wrappers around existing code.

### Cons

1. **Harder to trace event flow**: `emit('squeeze')` and `on('squeeze', ...)`
   are connected only by the string key. You can't cmd-click from the emit
   site to the handler. Grep for the topic name is the only way to find all
   producers and consumers. Mitigated by: typed TopicMap (compile-time
   checking of topic names and payload types), small number of topics
   (currently 6-8), and the convention of keeping all `bus.on()` calls in
   page/router constructors.

2. **One-frame delay for chained events**: if handler A emits event B during
   flush, event B is delivered next frame. For XR input and navigation this
   is fine (60fps = 16ms delay, imperceptible). For audio-critical timing,
   `onBeat` already uses `getDraw().schedule()` which is frame-aligned anyway,
   so no additional latency.

3. **Debugging state**: buffered events are invisible to breakpoints set on
   the emit site. You need to breakpoint inside `flush()` or the handler to
   see when events are actually processed. Mitigated by: small buffer sizes
   (typically 0-3 events per frame), and optional debug logging in flush.

4. **Topic proliferation**: as the app grows, TopicMap grows. If undisciplined,
   it becomes a god-object. Mitigated by: keeping topics at the domain level
   (input events, audio events, navigation events), not at the implementation
   level (no `updateBeatDecay` topic — that's a system, not an event).

5. **Shared mutable bus**: all modules hold a reference to the same bus. A
   module could emit any topic, not just "its own." No ownership enforcement.
   Mitigated by: code review, and the fact that emit-only and subscribe-only
   views can be created trivially if needed:
   ```ts
   type Emitter<K extends keyof TopicMap> = {
       emit(topic: K, payload: TopicMap[K]): void
   }
   ```

6. **Not suitable for request/response**: the bus is fire-and-forget. If a
   module needs a response (e.g., "is the game paused?"), it must query state
   directly, not send an event and wait. This is the correct design for this
   app — events represent things that happened, not questions.

## Implementation Cost Estimate

```
+-----+==================================+============+
| #   | Task                             | Estimate   |
+-----+==================================+============+
| 1   | createEventBus primitive +       | 1 hour     |
|     | TopicMap type definition         |            |
+-----+----------------------------------+------------+
| 2   | wireKeyboard adapter             | 15 min     |
+-----+----------------------------------+------------+
| 3   | Wire XR squeeze into bus         | 30 min     |
|     | (modify xr-session.ts)           |            |
+-----+----------------------------------+------------+
| 4   | Wire MusicPlayer onBeat/onEnd    | 30 min     |
|     | into bus (modify music-player.ts |            |
|     | to accept bus instead of         |            |
|     | callbacks)                        |            |
+-----+----------------------------------+------------+
| 5   | Update arena-page.ts to use bus  | 30 min     |
|     | subscribers instead of callback  |            |
|     | sets                             |            |
+-----+----------------------------------+------------+
| 6   | Update lobby-page.ts to use bus  | 15 min     |
+-----+----------------------------------+------------+
| 7   | Update router in main.ts: add    | 30 min     |
|     | flush() to render loop, pass bus |            |
|     | to pages, subscribe to navigate  |            |
+-----+----------------------------------+------------+
| 8   | Remove old callback wiring       | 15 min     |
|     | (returnListeners, onPlay, etc.)  |            |
+-----+----------------------------------+------------+
| 9   | Manual testing: lobby→arena→     | 30 min     |
|     | lobby transitions, beat pulses,  |            |
|     | song end, escape key, squeeze    |            |
+-----+----------------------------------+------------+
|     | TOTAL                            | ~4 hours   |
+-----+----------------------------------+------------+
```

Files touched: `main.ts`, `xr-session.ts`, `arena-page.ts`, `lobby-page.ts`,
`music-player.ts`, `types.ts` (add Teardown[] utility if needed), plus new
file `event-bus.ts`.

The bus primitive itself is small. Most of the work is rewiring existing
callback sites to use emit/subscribe and threading the bus dependency through
module constructors.
