Actor Mailboxes

## Problem Recap

Callbacks from XR controller events, keyboard listeners, Tone.js scheduled events, and
Babylon.js observables all fire at unpredictable times during the frame. When a callback
triggers heavy work (e.g. `navigate()` calling `composeMusic` + `createMusicPlayer`) or
disposes the very subsystem that fired the callback, three things go wrong:

1. **Re-entrancy** — A callback mutates state that the caller is still iterating over.
   Example: `onEnd` fires inside a Tone.js transport callback, calls `navigate()`, which
   calls `dispose()` on the music player, which cancels the transport mid-callback.

2. **Teardown-during-execution** — Arena's `dispose()` runs while arena systems are still
   in the render loop's `for...of` iteration. Sabers detach, stage disposes, but the
   current frame hasn't finished calling their systems yet.

3. **Thread blocking** — Synchronous heavy work inside an XR frame callback (squeeze handler
   calling `navigate()` which runs `composeMusic()`) blocks the XR compositor, causing
   frame drops or tab hangs.

## Core Idea

Each subsystem is an **actor** with a typed **mailbox** (queue of messages). External
callbacks never execute logic directly — they drop a message into the target actor's
mailbox via `actor.send(message)`. Each actor drains its mailbox once per frame, during
the render loop, in a defined order.

This gives three guarantees:

1. **No re-entrancy** — Messages are processed sequentially during tick, never during
   another message's processing. A Tone.js callback can't trigger `dispose()` mid-frame
   because it only enqueues a message.
2. **Deterministic teardown** — The router actor processes navigation messages after all
   other actors have finished their tick. Page disposal happens at a known safe point.
3. **No blocking** — XR frame callbacks do zero work beyond `mailbox.push(msg)`. Heavy
   work runs during the tick phase, which is already inside the render loop's time budget.

## The TypeScript Primitive

```ts
type MessageHandler<M> = (message: M) => void

interface Actor<M> {
    /** Enqueue a message. Safe to call from any callback context. */
    send(message: M): void
    /** Process all queued messages. Called once per frame by the scheduler. */
    tick(): void
    /** Discard all pending messages and prevent future processing. */
    dispose(): void
}

function createActor<M>(name: string, handler: MessageHandler<M>): Actor<M> {
    const mailbox: M[] = []
    let disposed = false

    return {
        send(message) {
            if (disposed) return  // silently drop — actor is dead
            mailbox.push(message)
        },

        tick() {
            if (disposed) return
            // Drain snapshot — messages added during processing go to next frame
            const batch = mailbox.splice(0, mailbox.length)
            for (const message of batch) {
                handler(message)
            }
        },

        dispose() {
            disposed = true
            mailbox.length = 0
        },
    }
}
```

Key design decisions:

- **`splice(0, length)` drain** — Takes a snapshot of current messages. Any `send()` calls
  that happen during processing go into the now-empty `mailbox` array and wait for next
  frame. This prevents infinite loops where an actor's handler triggers more messages to
  itself within the same tick.
- **`disposed` flag** — After disposal, `send()` silently drops. This handles the case
  where a Tone.js callback fires after the music player was disposed (transport teardown
  is async — scheduled callbacks may still fire for one frame).
- **No return values** — Actors are fire-and-forget. If actor A needs a response from
  actor B, actor B sends a message back to actor A on a subsequent frame.

## How Every Callback Becomes `actor.send()`

Current code has callbacks that directly invoke logic:

```ts
// BEFORE: squeeze callback directly navigates (blocks XR frame)
xrSession.onSqueeze((hand) => {
    navigate({ page: 'lobby' })
})

// BEFORE: Tone.js onEnd directly navigates (re-entrancy risk)
transport.schedule(() => {
    stop()
    onEnd()  // -> navigate() -> dispose() while transport is still running
}, songEndTime)

// BEFORE: keydown directly navigates
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        for (const cb of returnListeners) cb()  // -> navigate()
    }
})
```

After the actor pattern, every callback becomes a single `send()`:

```ts
// AFTER: squeeze callback drops a message — zero work
xrSession.onSqueeze((hand) => {
    arenaActor.send({ type: 'squeeze', hand })
})

// AFTER: Tone.js onEnd drops a message — no re-entrancy
transport.schedule(() => {
    stop()
    arenaActor.send({ type: 'song-ended' })
}, songEndTime)

// AFTER: keydown drops a message
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        arenaActor.send({ type: 'escape-pressed' })
    }
})
```

The callbacks do zero logic. The actor's `tick()` handler processes these during the
render loop at a controlled time.

## Actor Tick Ordering and Why It Matters

Actors are ticked in a fixed order each frame. The order is chosen to prevent one
specific class of bug: an actor processing messages against state that another actor
has already torn down in the same frame.

```
Frame tick order:
  1. Input actors     (XR controller, keyboard)
  2. Gameplay actors  (arena, audio timeline)
  3. Router actor     (navigation, page lifecycle)
```

Why this specific order:

- **Input first** — Controller and keyboard actors translate raw events into semantic
  messages (`squeeze` -> `request-return-to-lobby`). These messages land in gameplay
  actors' mailboxes for processing in the same frame.

- **Gameplay second** — Arena processes beat events, collision results, song-end signals.
  If the song ended or the player squeezed, arena produces a `navigate` message for the
  router. Arena does NOT dispose itself — it just sends the message.

- **Router last** — Router processes navigation messages. When it sees `navigate-to-lobby`,
  it calls `currentPage.dispose()`, creates the new page, and swaps the actor set. Because
  all other actors have already finished their tick for this frame, disposal is safe — no
  one will try to read disposed state within this frame.

The render loop becomes:

```ts
// In main.ts — the scheduler
const actorSchedule: Actor<unknown>[] = []

scene.onBeforeRenderObservable.add(() => {
    for (const actor of actorSchedule) {
        actor.tick()
    }
    // Then run per-frame systems (visual updates, trails, beat decay)
    const dt = engine.getDeltaTime() / 1000
    for (const system of router.activeSystems()) {
        system(dt)
    }
})
```

If the router disposes the arena during its tick, the arena's systems are removed from
`activeSystems()` before the system loop runs. No stale system calls.

## Cross-Actor Communication Patterns

### One-Way: Input -> Gameplay

The most common pattern. Input actor translates raw events and sends to gameplay actor.

```ts
// Input actor handler
type InputMessage =
    | { readonly type: 'xr-squeeze'; readonly hand: Hand }
    | { readonly type: 'key-down'; readonly key: string }

const inputActor = createActor<InputMessage>('input', (msg) => {
    switch (msg.type) {
        case 'xr-squeeze':
            // Translate raw input to gameplay intent
            arenaActor.send({ type: 'request-return-to-lobby' })
            break
        case 'key-down':
            if (msg.key === 'Escape') {
                arenaActor.send({ type: 'request-return-to-lobby' })
            }
            break
    }
})
```

### One-Way: Gameplay -> Router

Gameplay actors never navigate directly. They send navigation requests.

```ts
type ArenaMessage =
    | { readonly type: 'beat'; readonly beatIndex: number }
    | { readonly type: 'song-ended' }
    | { readonly type: 'request-return-to-lobby' }

const arenaActor = createActor<ArenaMessage>('arena', (msg) => {
    switch (msg.type) {
        case 'beat':
            stage.onBeat()
            break
        case 'song-ended':
            routerActor.send({ type: 'navigate'; route: { page: 'lobby' } })
            break
        case 'request-return-to-lobby':
            routerActor.send({ type: 'navigate', route: { page: 'lobby' } })
            break
    }
})
```

### Router Owns Lifecycle

The router actor is the only one that creates/disposes pages and swaps the active
actor set.

```ts
type RouterMessage =
    | { readonly type: 'navigate'; readonly route: Route }

const routerActor = createActor<RouterMessage>('router', (msg) => {
    switch (msg.type) {
        case 'navigate':
            // Safe: all other actors already ticked this frame
            teardownCurrentPage()
            setupPage(msg.route)  // creates new actors, wires callbacks
            break
    }
})
```

### Pattern: No Circular Messages Within One Frame

Actor A sending to actor B during B's tick is fine — the message arrives in B's mailbox
and waits for next frame (because B already drained its snapshot). Actor A sending to
itself during its own tick also waits for next frame. This prevents infinite processing
loops by construction.

If you need A and B to coordinate within one frame (rare), restructure so both read from
a shared immutable snapshot, or merge them into one actor.

## Concrete Examples

### Example 1: XR Controller Squeeze -> Return to Lobby

```
Frame N:
  XR observable fires → inputActor.send({ type: 'xr-squeeze', hand: 'right' })

  Tick phase:
    1. inputActor.tick()
       → processes 'xr-squeeze'
       → arenaActor.send({ type: 'request-return-to-lobby' })
    2. arenaActor.tick()
       → processes 'request-return-to-lobby'
       → musicPlayer.stop()
       → routerActor.send({ type: 'navigate', route: { page: 'lobby' } })
    3. routerActor.tick()
       → processes 'navigate'
       → arenaPage.dispose()    // safe: arena tick is done
       → creates lobbyPage
       → swaps active systems and actors

  System phase:
    → lobby systems run (arena systems already removed)
```

Total latency: 0 frames. Everything happens within one frame, but in safe order.

### Example 2: Audio Song End -> Navigate to Lobby

```
Frame N:
  Tone.js transport fires scheduled callback
    → arenaActor.send({ type: 'song-ended' })
    (transport.stop() already called inside Tone.js callback — that's fine,
     it's Tone.js internal cleanup, not our scene graph)

  Tick phase:
    1. inputActor.tick() → nothing
    2. arenaActor.tick()
       → processes 'song-ended'
       → routerActor.send({ type: 'navigate', route: { page: 'lobby' } })
    3. routerActor.tick()
       → arenaPage.dispose()
       → creates lobbyPage
```

The key difference from current code: `onEnd()` no longer calls `navigate()` from
inside a Tone.js transport callback. The transport callback only does
`arenaActor.send(...)`, which is a single array push.

### Example 3: Audio Beat -> Stage Pulse

```
Frame N:
  Tone.js getDraw().schedule fires on animation frame
    → arenaActor.send({ type: 'beat', beatIndex: 42 })

  Tick phase:
    1. inputActor.tick() → nothing
    2. arenaActor.tick()
       → processes 'beat'
       → stage.onBeat()    // triggers pillar/fog pulse
    3. routerActor.tick() → nothing

  System phase:
    → stage.beatDecaySystem(dt) runs, decays the pulse set up by onBeat()
```

### Example 4: Keyboard Escape in Lobby -> Navigate to Arena (Play)

```
Frame N:
  keydown event fires
    → inputActor.send({ type: 'key-down', key: 'Escape' })

  Tick phase:
    1. inputActor.tick()
       → processes 'key-down' with key='Escape'
       → lobbyActor.send({ type: 'play-requested' })
    2. lobbyActor.tick()
       → processes 'play-requested'
       → routerActor.send({ type: 'navigate', route: { page: 'arena' } })
    3. routerActor.tick()
       → lobbyPage.dispose()
       → creates arenaPage (composeMusic, createMusicPlayer — heavy work,
         but we're inside the render loop, not inside an XR callback)
```

### Example 5: Multiple Messages in One Frame (Squeeze + Song End)

Edge case: player squeezes grip at the exact moment the song ends. Both messages
arrive in arenaActor's mailbox for the same frame.

```
Frame N:
  XR squeeze fires → inputActor.send({ type: 'xr-squeeze', hand: 'left' })
  Tone.js end fires → arenaActor.send({ type: 'song-ended' })

  Tick phase:
    1. inputActor.tick()
       → arenaActor.send({ type: 'request-return-to-lobby' })
    2. arenaActor.tick()
       → drains: ['song-ended', 'request-return-to-lobby']
       → processes 'song-ended' → routerActor.send({ type: 'navigate', ... })
       → processes 'request-return-to-lobby' → routerActor.send({ type: 'navigate', ... })
    3. routerActor.tick()
       → drains: ['navigate', 'navigate']
       → processes first 'navigate' → disposes arena, creates lobby
       → processes second 'navigate' → disposes lobby, creates lobby again (!)
```

This is a real problem. The router must be idempotent or deduplicate. Simple fix:
router checks if the requested route matches current route and skips.

```ts
const routerActor = createActor<RouterMessage>('router', (msg) => {
    switch (msg.type) {
        case 'navigate':
            if (currentRoute?.page === msg.route.page) return  // already there
            teardownCurrentPage()
            setupPage(msg.route)
            break
    }
})
```

## Teardown Safety

The specific ordering (input -> gameplay -> router) creates a teardown protocol:

1. **Disposal only happens in router's tick.** No other actor calls `dispose()` on a page
   or removes actors from the schedule. This is enforced by convention — gameplay actors
   send navigation messages, they don't navigate.

2. **Disposed actors silently drop messages.** After `routerActor` disposes the arena page
   (which disposes `arenaActor`), any straggling messages from Tone.js callbacks that
   fire after disposal are silently dropped by the `disposed` check in `send()`.

3. **The actor schedule is updated atomically.** When the router creates a new page, it
   swaps the entire actor set in one step. The next frame sees only the new page's actors.
   There's no frame where half-old, half-new actors run.

4. **No mid-tick actor list mutation.** The `actorSchedule` array is iterated with a plain
   `for...of`. The router modifies it at the end of its own tick (it's last in the list),
   so the iteration is already complete. Alternatively, double-buffer: tick from a frozen
   snapshot, apply mutations to the live list.

```ts
// Safe schedule swap in router
function setupPage(route: Route): void {
    switch (route.page) {
        case 'arena': {
            const arena = createArenaPage(scene, theme, xrSession)
            const newArenaActor = createActor<ArenaMessage>('arena', arenaHandler)
            // Wire callbacks to new actor
            wireArenaCallbacks(newArenaActor, arena)
            // Atomic swap of page actors
            replacePageActors([newArenaActor])
            currentPage = arena
            break
        }
        // ...
    }
}
```

## Full Wiring Sketch

Showing how actors, callbacks, and the render loop connect:

```ts
// main.ts — actor-based router

type RouterMsg = { readonly type: 'navigate'; readonly route: Route }
type InputMsg =
    | { readonly type: 'xr-squeeze'; readonly hand: Hand }
    | { readonly type: 'key-down'; readonly key: string }
type ArenaMsg =
    | { readonly type: 'beat'; readonly beatIndex: number }
    | { readonly type: 'song-ended' }
    | { readonly type: 'request-return-to-lobby' }
type LobbyMsg =
    | { readonly type: 'play-requested' }

// Persistent actors (survive page transitions)
const routerActor = createActor<RouterMsg>('router', handleRouterMsg)
const inputActor = createActor<InputMsg>('input', handleInputMsg)

// Page-scoped actors (created/disposed with their page)
let pageActors: Actor<unknown>[] = []

// The schedule — ticked every frame in this order
function allActors(): Actor<unknown>[] {
    return [inputActor, ...pageActors, routerActor]
}

// Render loop
scene.onBeforeRenderObservable.add(() => {
    for (const actor of allActors()) {
        actor.tick()
    }
    const dt = engine.getDeltaTime() / 1000
    for (const system of currentSystems) {
        system(dt)
    }
})

// Wire XR squeeze to input actor (once, on XR session creation)
xrSession.onSqueeze((hand) => {
    inputActor.send({ type: 'xr-squeeze', hand })
})

// Wire keyboard to input actor (once, on app boot)
document.addEventListener('keydown', (e) => {
    inputActor.send({ type: 'key-down', key: e.key })
})

// Wire Tone.js callbacks when arena is created
function wireArenaAudio(arenaActor: Actor<ArenaMsg>): void {
    const musicPlayer = createMusicPlayer(
        composition,
        () => { arenaActor.send({ type: 'beat', beatIndex: nextBeat++ }) },
        () => { arenaActor.send({ type: 'song-ended' }) },
    )
}
```

## Tradeoffs

### Advantages

1. **Eliminates re-entrancy by construction.** No callback can execute domain logic
   synchronously. The only thing callbacks do is push to an array. This is the single
   biggest win — the entire class of "dispose during execution" bugs disappears.

2. **Deterministic frame ordering.** When debugging, you know exactly when each actor
   processes its messages. `console.log` in actor handlers gives a clean linear trace
   instead of nested callback spaghetti.

3. **Teardown is trivially safe.** Disposal always happens in the router's tick, after
   all other actors have finished. No disposed-while-iterating, no use-after-free.

4. **XR frame stays clean.** XR callbacks do a single array push. No risk of blocking
   the compositor with heavy synchronous work.

5. **Scales to more subsystems.** Adding a choreography actor, a scoring actor, or a
   pause-menu actor follows the same pattern. Each gets a typed mailbox, a position in
   the tick order, and communicates via messages.

6. **Typed messages per actor.** Each actor has its own discriminated union of messages.
   `switch` + `assertNever` ensures exhaustive handling. Adding a new message type is
   a compile error until handled.

### Disadvantages

1. **Cross-actor coupling is implicit.** Actor A sends messages to actor B by holding a
   reference to B. This creates a dependency graph that isn't visible in the type system.
   When an actor is disposed, senders need to know (or messages silently drop). If silent
   dropping isn't acceptable for a particular message type, you need explicit liveness
   checks, which erodes the simplicity.

2. **Debugging requires tracing across mailboxes.** A single user action (squeeze grip)
   produces a chain: `inputActor` -> `arenaActor` -> `routerActor`. Each hop is a separate
   `tick()` call in the same frame. Stack traces don't show the full chain — you see three
   separate call stacks. Requires logging discipline (log actor name + message type on
   every send and every process) to reconstruct the chain.

3. **One-frame latency for cross-actor responses.** If actor A sends to actor B during B's
   tick (B already drained), B processes it next frame. In practice this is 11-16ms at
   72-90Hz — imperceptible for navigation or audio events, but worth knowing. Within-frame
   delivery requires careful tick ordering (sender before receiver).

4. **Message type proliferation.** Every event type needs a message variant. XR squeeze,
   XR trigger, thumbstick move, keyboard key, beat, bar-change, song-end, pause, resume,
   navigate — each is a message type in some actor's union. For a small project, this is
   more ceremony than bare callbacks.

5. **Actor lifecycle management.** Page-scoped actors must be created and disposed with
   their page. The router must update the tick schedule atomically. This is bookkeeping
   that doesn't exist with plain callbacks.

6. **Duplicate navigation messages.** As shown in Example 5, concurrent events can produce
   duplicate navigation requests. Every actor that receives messages from multiple sources
   needs deduplication or idempotency logic. This is a new class of bug that doesn't exist
   with synchronous callbacks (where the first callback would have already navigated before
   the second fires).

7. **Overhead for simple cases.** The beat event (Tone.js -> stage pulse) is a perfectly
   safe callback today — `getDraw().schedule(onBeat, time)` already defers to animation
   frame. Wrapping it in an actor message adds indirection without solving a real problem
   for that specific case.

## Implementation Cost Estimate

```
+-----+================================+==============+=============+
| #   | Task                           | Effort       | Risk        |
+-----+================================+==============+=============+
| 1   | createActor primitive +        | 1 hour       | Low         |
|     | types in types.ts              |              |             |
+-----+--------------------------------+--------------+-------------+
| 2   | Actor scheduler in main.ts     | 1 hour       | Low         |
|     | (tick loop, schedule swap)      |              |             |
+-----+--------------------------------+--------------+-------------+
| 3   | Router actor: replace          | 2-3 hours    | Medium      |
|     | navigate() with message-based  |              |             |
|     | navigation, wire page actor    |              |             |
|     | lifecycle                      |              |             |
+-----+--------------------------------+--------------+-------------+
| 4   | Input actor: wire XR squeeze   | 1 hour       | Low         |
|     | and keyboard events            |              |             |
+-----+--------------------------------+--------------+-------------+
| 5   | Arena actor: wire beat, song   | 2 hours      | Medium      |
|     | end, return-to-lobby through   |              |             |
|     | messages instead of callbacks  |              |             |
+-----+--------------------------------+--------------+-------------+
| 6   | Lobby actor: wire play request | 1 hour       | Low         |
|     | through messages               |              |             |
+-----+--------------------------------+--------------+-------------+
| 7   | Dedup/idempotency in router    | 1 hour       | Low         |
+-----+--------------------------------+--------------+-------------+
| 8   | Remove old callback wiring,    | 1-2 hours    | Medium      |
|     | test full flow (lobby -> arena |              |             |
|     | -> lobby via squeeze, song     |              |             |
|     | end, escape key)               |              |             |
+-----+--------------------------------+--------------+-------------+
|     | TOTAL                          | 10-12 hours  |             |
+-----+--------------------------------+--------------+-------------+
```

Risk notes:
- **Task 3** is the hardest — router currently uses closure-captured `let` variables
  (`currentSystems`, `teardown`, `xrSession`). Converting to message-driven requires
  restructuring how the router holds and swaps page state.
- **Task 5** requires touching music-player.ts to change how `onBeat` and `onEnd`
  callbacks are passed. Currently they're constructor arguments; they'd become
  `arenaActor.send()` calls from the arena page's wiring code.
- **Task 8** is where hidden bugs surface — timing edge cases only visible on actual
  Quest 2 hardware (XR frame timing differs from desktop).
