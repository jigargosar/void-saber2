Pattern 03 — FSM with Guarded Transitions

## Problem Recap

Callbacks in the app fire from diverse contexts: XR controller observables (inside
the WebXR frame loop), keyboard events (DOM), Tone.js transport schedules (audio
thread via `getDraw()`), and in-engine observables (Babylon render loop). When these
callbacks directly mutate state or trigger navigation, three things go wrong:

1. **Re-entrancy** — a callback fires `navigate()`, which disposes the current page,
   which clears the listener set that's currently being iterated.
2. **Teardown-during-execution** — `onEnd` fires from Tone transport, calls
   `navigate()`, which disposes the MusicPlayer whose transport scheduled the callback.
3. **Thread blocking** — heavy sync work (composeMusic + synth graph construction)
   inside an XR frame callback blocks the browser's XR compositor, freezing the headset.

All three are symptoms of the same root cause: callbacks execute arbitrary work
immediately, in whatever context they happen to fire from.

## Core Idea

Model the entire app as a finite state machine. Every callback — XR squeeze, keyboard
press, audio beat, song end, menu click — does exactly one thing: `fsm.send(trigger)`.
No disposal, no construction, no navigation, no side effects. Just a trigger.

The render loop — which runs once per frame, in a predictable context, outside any
callback stack — processes at most one pending trigger per frame. If the trigger is
valid for the current state, the FSM transitions: exit actions run, state updates,
enter actions run. If the trigger is invalid (e.g. "pause" while already in menu),
it is silently dropped.

This gives us:

- **Single processing context** — all side effects happen in the render loop, never
  inside a callback. No re-entrancy, no thread blocking.
- **One transition per frame** — at most one state change per 16ms tick. Heavy work
  (page creation) is amortized across frames, never stacked.
- **Transition table as spec** — every legal state change is an explicit row in a
  table. Invalid transitions are impossible by construction — no runtime guard clauses
  scattered across the codebase.

## The TypeScript Primitive

```ts
// ── Types ───────────────────────────────────────────────────

type TransitionFn<S, T> = (
    current: S,
    trigger: T,
) => S | null   // null = transition rejected

interface FSMConfig<S, T> {
    readonly initial: S
    readonly transition: TransitionFn<S, T>
    readonly onEnter?: (state: S) => void
    readonly onExit?: (state: S) => void
}

interface FSM<S, T> {
    readonly state: S
    send(trigger: T): void       // enqueue — called from any context
    tick(): void                  // process — called once per render frame
    dispose(): void
}

// ── Implementation ──────────────────────────────────────────

function createFSM<S, T>(config: FSMConfig<S, T>): FSM<S, T> {
    let current: S = config.initial
    let pending: T | null = null

    return {
        get state() { return current },

        send(trigger) {
            // Last-write-wins within a frame. Multiple triggers between
            // ticks: only the last one is processed. This is intentional —
            // at most one transition per frame.
            pending = trigger
        },

        tick() {
            if (pending === null) return

            const trigger = pending
            pending = null

            const next = config.transition(current, trigger)
            if (next === null) return   // invalid transition — silently drop

            config.onExit?.(current)
            current = next
            config.onEnter?.(next)
        },

        dispose() {
            pending = null
        },
    }
}
```

Key design decisions:

- `send()` stores the trigger, nothing else. Safe to call from any context.
- `tick()` runs in the render loop. Heavy work (page creation, audio graph
  construction) happens here, in a predictable stack.
- `transition()` returns `null` for invalid transitions — no throws, no logs, just
  dropped. The transition table is the authority.
- Last-write-wins for multiple triggers in one frame. Alternative: queue all triggers
  and process first-valid. Last-write-wins is simpler and matches VR input semantics
  (latest input is most relevant).

## Transition Table — The Spec

The transition function is a pure switch that encodes every valid state change.
Invalid combinations fall through to `return null`.

```ts
// ── App-level states ────────────────────────────────────────

type AppState =
    | { readonly page: 'splash' }
    | { readonly page: 'lobby' }
    | { readonly page: 'arena'; readonly phase: ArenaPhase }

type ArenaPhase = 'playing' | 'paused' | 'results'

// ── Triggers ────────────────────────────────────────────────

type AppTrigger =
    | { readonly type: 'xr-ready' }
    | { readonly type: 'play' }
    | { readonly type: 'pause' }
    | { readonly type: 'resume' }
    | { readonly type: 'song-end' }
    | { readonly type: 'return-to-lobby' }
    | { readonly type: 'beat' }        // not a state transition — see below

// ── Transition table ────────────────────────────────────────

function appTransition(
    current: AppState,
    trigger: AppTrigger,
): AppState | null {
    switch (trigger.type) {
        case 'xr-ready':
            if (current.page === 'splash') return { page: 'lobby' }
            return null

        case 'play':
            if (current.page === 'lobby') return { page: 'arena', phase: 'playing' }
            return null

        case 'pause':
            if (current.page === 'arena' && current.phase === 'playing')
                return { page: 'arena', phase: 'paused' }
            return null

        case 'resume':
            if (current.page === 'arena' && current.phase === 'paused')
                return { page: 'arena', phase: 'playing' }
            return null

        case 'song-end':
            if (current.page === 'arena' && current.phase === 'playing')
                return { page: 'arena', phase: 'results' }
            return null

        case 'return-to-lobby':
            if (current.page === 'arena'
                && (current.phase === 'paused' || current.phase === 'results'))
                return { page: 'lobby' }
            return null

        default:
            return null
    }
}
```

Reading this table tells you every legal state change in the app. If a row
isn't here, it can't happen. This is the living documentation — not comments,
not a diagram, but the actual enforced behavior.

Rendered as a table for readability:

```
+-----+=================+====================+=================+
| #   | From            | Trigger            | To              |
+-----+=================+====================+=================+
| 1   | splash          | xr-ready           | lobby           |
+-----+-----------------+--------------------+-----------------+
| 2   | lobby           | play               | arena:playing   |
+-----+-----------------+--------------------+-----------------+
| 3   | arena:playing   | pause              | arena:paused    |
+-----+-----------------+--------------------+-----------------+
| 4   | arena:paused    | resume             | arena:playing   |
+-----+-----------------+--------------------+-----------------+
| 5   | arena:playing   | song-end           | arena:results   |
+-----+-----------------+--------------------+-----------------+
| 6   | arena:paused    | return-to-lobby    | lobby           |
+-----+-----------------+--------------------+-----------------+
| 7   | arena:results   | return-to-lobby    | lobby           |
+-----+-----------------+--------------------+-----------------+
```

## How Every Callback Becomes send()

Before FSM — callbacks do real work:

```ts
// Inside arena-page.ts
arena.onReturnToLobby(() => { navigate({ page: 'lobby' }) })

// Inside music-player.ts transport schedule
transport.schedule(() => {
    stop()      // stops transport
    onEnd()     // fires navigate → disposes self while still in callback
}, composition.totalTime + TAIL_SECONDS)
```

After FSM — callbacks just send:

```ts
// XR squeeze (inside xr observable callback)
xr.input.onControllerAddedObservable.add((source) => {
    const component = motionController.getComponentOfType('squeeze')
    component.onButtonStateChangedObservable.add(() => {
        if (component.changes.pressed?.current) {
            fsm.send({ type: 'pause' })
        }
    })
})

// Keyboard
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fsm.send({ type: 'return-to-lobby' })
    if (e.key === 'p')      fsm.send({ type: 'pause' })
})

// Audio beat (Tone.js Draw callback — fires on animation frame)
getDraw().schedule(() => {
    fsm.send({ type: 'beat' })
}, time)

// Song end (Tone.js transport schedule)
transport.schedule(() => {
    fsm.send({ type: 'song-end' })
}, composition.totalTime + TAIL_SECONDS)

// Lobby menu play button
menu.onClick('play', () => {
    fsm.send({ type: 'play' })
})
```

Every callback is a single `fsm.send()` call. No branching, no state checking,
no disposal, no construction. The callback doesn't know what state the app is in
and doesn't need to — the transition table handles validity.

## Wiring to the Render Loop

```ts
function main(): void {
    const { engine, scene } = setupEngine()

    const fsm = createFSM<AppState, AppTrigger>({
        initial: { page: 'splash' },
        transition: appTransition,
        onExit: (state) => exitState(state, scene),
        onEnter: (state) => enterState(state, scene),
    })

    // Boot
    enterState(fsm.state, scene)

    scene.onBeforeRenderObservable.add(() => {
        // Process at most one state transition per frame
        fsm.tick()

        // Run active page systems
        const dt = engine.getDeltaTime() / 1000
        for (const system of activeSystems) {
            system(dt)
        }
    })

    engine.runRenderLoop(() => scene.render())
}
```

The `enterState` / `exitState` functions are where heavy work lives — page
construction, disposal, audio graph setup. They run inside the render loop tick,
not inside any callback context.

```ts
let activeSystems: readonly System[] = []
let currentTeardown: Teardown = () => {}

function exitState(state: AppState, scene: Scene): void {
    currentTeardown()
    activeSystems = []
    currentTeardown = () => {}
}

function enterState(state: AppState, scene: Scene): void {
    switch (state.page) {
        case 'splash': {
            const splash = createSplash(scene)
            activeSystems = splash.systems
            currentTeardown = splash.dispose
            break
        }
        case 'lobby': {
            const lobby = createLobbyPage(scene)
            activeSystems = lobby.systems
            currentTeardown = lobby.dispose
            break
        }
        case 'arena': {
            // Arena manages sub-phases internally — see next section
            const arena = createArenaPage(scene, theme, xrSession)
            activeSystems = arena.systems
            currentTeardown = arena.dispose
            break
        }
    }
}
```

## Teardown Safety

The original bug: `onEnd` callback fires from Tone.js transport, calls `navigate()`,
which calls `musicPlayer.dispose()` — disposing the transport that is currently
executing the callback. This is spooky action at a distance.

With the FSM, this is structurally impossible:

1. Tone.js transport fires `onEnd` callback. Callback does `fsm.send({ type: 'song-end' })`.
   Just sets `pending`. Returns immediately. Transport callback stack unwinds cleanly.

2. On the next render frame, `fsm.tick()` runs. Transition table says
   `arena:playing + song-end → arena:results`. `onExit` runs (disposes arena including
   music player). `onEnter` runs (shows results screen).

3. The MusicPlayer is disposed from the render loop, not from inside its own transport
   callback. No self-disposal, no re-entrancy.

The same pattern prevents every teardown hazard:

- **Navigate during XR frame** — squeeze sends trigger, navigate happens next frame.
  XR frame callback returns immediately, no compositor blocking.
- **Double-dispose** — page is only disposed in `exitState`, which only runs on valid
  transitions. You can't transition out of a state you're not in.
- **Stale callbacks** — if a callback fires after its page is disposed (e.g. a queued
  DOM event), the trigger is invalid for the current state and silently dropped.

## Sub-States (Arena Internal Phases)

Arena has three internal phases: playing, paused, results. Two approaches:

### Option A — Flat FSM (Recommended)

Encode arena phases directly in the top-level state, as shown in the transition table
above. The `AppState` for arena carries the phase:
`{ page: 'arena', phase: 'playing' | 'paused' | 'results' }`.

Pros: single transition table, one FSM, one tick per frame, all transitions visible
in one place.

Cons: top-level FSM grows with every sub-state. Acceptable at this app's scale.

### Option B — Nested FSMs

Arena owns a child FSM for its internal phases. Top-level FSM has `'arena'` as a
single state. Arena's child FSM handles `pause`, `resume`, `song-end`.

```ts
function createArenaPage(scene: Scene, theme: Theme, xrSession: XRSession) {
    const phaseFSM = createFSM<ArenaPhase, ArenaPhaseTriger>({
        initial: 'playing',
        transition: arenaTransition,
        onEnter: (phase) => { /* show/hide pause overlay, results screen */ },
    })

    return {
        systems: [
            stage.beatDecaySystem,
            sabers.trailUpdateSystem,
            (dt) => phaseFSM.tick(),   // child FSM ticks inside parent's system loop
        ],
        // ...
    }
}
```

Pros: arena is self-contained. Top-level FSM stays small. Pages can be developed
independently.

Cons: two FSMs, two ticks, ordering matters. Parent needs to know when child reaches
terminal state (results → return-to-lobby must bubble up).

**Recommendation:** Start with flat (Option A). Move to nested only if the transition
table exceeds ~15 rows — it won't for this game.

## Non-Transition Events (Beats)

Not everything is a state transition. Beat events (`onBeat`) are ephemeral — they
trigger a visual pulse on the stage pillars, not a state change. Two approaches:

### Approach 1 — Separate Channel

Beats bypass the FSM entirely. MusicPlayer calls `onBeat` directly, and the stage
pulse system reads a flag:

```ts
// In music-player's kick part callback:
getDraw().schedule(() => { stage.onBeat() }, time)
```

This is the current design. It works because `onBeat` has no state implications —
it just sets a decay value that the `beatDecaySystem` reads next frame. No disposal
risk (worst case: beat fires after page dispose, calls a detached function, no-op).

### Approach 2 — FSM Side-Channel

FSM receives `beat` triggers and fires a separate handler without transitioning:

```ts
function tick() {
    if (pending === null) return
    const trigger = pending
    pending = null

    // Non-transition events — side effects without state change
    if (trigger.type === 'beat') {
        beatHandler?.()
        return
    }

    // Normal transition logic...
}
```

**Recommendation:** Approach 1. Beats are high-frequency (every kick hit, ~2-4 per
second) and have no state implications. Running them through the FSM adds overhead
and conflates triggers-that-change-state with triggers-that-don't. Keep the FSM for
state transitions only.

## Concrete Examples — Full Mapping

### XR Controller Squeeze (pause game)

```ts
// In xr-session.ts or wherever controller observables are wired
component.onButtonStateChangedObservable.add(() => {
    if (component.changes.pressed?.current) {
        fsm.send({ type: 'pause' })
    }
})
// Result: if arena:playing → arena:paused. Otherwise dropped.
```

### Keyboard Escape (context-dependent)

```ts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Caller doesn't decide what Escape means.
        // Send the most specific intent, let the table sort it out.
        fsm.send({ type: 'return-to-lobby' })
    }
})
```

This reveals a design question: should Escape mean "pause" during playing and
"return to lobby" during paused/results? Two options:

1. Send a generic `'escape'` trigger and add two rows to the transition table
   (playing+escape→paused, paused+escape→lobby).
2. Send different triggers based on current state — but that means the callback
   knows about state, defeating the purpose.

Option 1 is correct. Add an `'escape'` trigger:

```ts
case 'escape':
    if (current.page === 'arena' && current.phase === 'playing')
        return { page: 'arena', phase: 'paused' }
    if (current.page === 'arena'
        && (current.phase === 'paused' || current.phase === 'results'))
        return { page: 'lobby' }
    return null
```

### Audio Song End

```ts
// In music-player.ts
transport.schedule(() => {
    onEnd()   // onEnd is wired to fsm.send({ type: 'song-end' })
}, composition.totalTime + TAIL_SECONDS)
```

The MusicPlayer doesn't need to know about the FSM. Its `onEnd` callback is wired
by the arena page creator to `fsm.send`. MusicPlayer just fires it.

### Page Navigation

Navigation is no longer explicit. There is no `navigate()` function. Instead, state
transitions that change `page` trigger `onExit` (dispose old page) and `onEnter`
(create new page). The FSM *is* the router.

```ts
// Before: explicit navigate
lobby.onPlay(() => { navigate({ page: 'arena' }) })

// After: lobby doesn't navigate. It sends a trigger.
// The transition table decides if lobby→arena is valid.
// enterState() creates the arena page.
```

### Pause / Resume

```ts
// Pause: squeeze during gameplay
fsm.send({ type: 'pause' })
// Table: arena:playing → arena:paused

// Resume: squeeze during pause, or menu button
fsm.send({ type: 'resume' })
// Table: arena:paused → arena:playing
```

In the enter/exit handlers, pausing freezes the music player and shows an overlay.
Resuming hides the overlay and resumes music. These side effects live in
`onEnter`/`onExit`, not in callbacks.

## Tradeoffs

### Pros

1. **Eliminates re-entrancy and teardown bugs by construction.** Callbacks never
   execute side effects. All mutations happen in a single, predictable call site
   (`tick()` inside the render loop).

2. **Transition table is the spec.** All valid state changes are in one place. You
   can read it top to bottom and understand every possible flow. No scattered guard
   clauses, no hidden navigate() calls.

3. **Callback simplification.** Every callback becomes a one-liner: `fsm.send(...)`.
   No branching, no state checking, no error handling. Callbacks are trivially correct.

4. **Eliminates the XR frame blocking bug.** The known bug (squeeze → navigate →
   composeMusic blocks XR compositor) becomes impossible. Squeeze sends a trigger.
   Heavy work runs next frame.

5. **Invalid transitions are silent no-ops.** Song-end fires twice? Dropped. Squeeze
   fires after page disposed? Dropped. No error handling needed at call sites.

6. **Natural fit for the existing architecture.** The app already has a render loop,
   already has page lifecycle with enter/exit, already has `game-state.ts` modeling
   phases. FSM formalizes what's already half-there.

### Cons

1. **One-trigger-per-frame limitation.** If two triggers arrive in the same frame
   (e.g. squeeze and song-end simultaneously), only the last one is processed. In
   practice this is rarely a problem — VR runs at 72-90 fps, and meaningful user
   actions don't happen within 11-14ms of each other. But it means rapid-fire triggers
   could be lost.

   *Mitigation:* Switch to a queue (process first valid trigger per frame) if this
   becomes observable. Cost: ~5 lines of code.

2. **One-frame delay on all state changes.** Every trigger is deferred to the next
   render tick. For navigation this is fine (16ms delay is imperceptible). For
   time-sensitive input (e.g. saber collision detection), this may matter.

   *Mitigation:* Not all systems need the FSM. High-frequency, stateless operations
   (beat pulses, trail updates, collision checks) can bypass it.

3. **Scaling with many states.** The transition function grows linearly with the number
   of (state, trigger) pairs. For this game (7 transitions), it's trivial. For a game
   with 50 states and 30 triggers, the function becomes unwieldy.

   *Mitigation:* Table-driven approach (Map from state+trigger to next state) or nested
   FSMs. Not needed here.

4. **Side effects in onEnter/onExit can still be complex.** The FSM doesn't eliminate
   page creation complexity — it just moves it from callbacks to enter/exit hooks. If
   `enterState('arena')` is slow, the frame that runs it still stutters.

   *Mitigation:* Async enter/exit with a loading state. Overkill for this project.

5. **Debugging indirection.** When something goes wrong, the trigger → transition →
   enter/exit chain is less direct than a simple function call. You need to trace:
   what trigger was sent, what state was current, what the table produced.

   *Mitigation:* A single `console.log` in `tick()` that logs `[FSM] {current} + {trigger} → {next}` makes every transition visible.

6. **Ephemeral events don't fit naturally.** Beat pulses, score increments, and other
   high-frequency non-state events must bypass the FSM or be handled as special cases.
   The FSM is for state transitions, not for all communication.

## Implementation Cost Estimate

```
+-----+=======================================+==========+
| #   | Task                                  | Effort   |
+-----+=======================================+==========+
| 1   | createFSM primitive (types + impl)    | 1 hour   |
+-----+---------------------------------------+----------+
| 2   | Define AppState, AppTrigger,          | 1 hour   |
|     | transition table                      |          |
+-----+---------------------------------------+----------+
| 3   | Wire fsm.tick() into render loop      | 30 min   |
+-----+---------------------------------------+----------+
| 4   | Implement enterState / exitState      | 2 hours  |
|     | (replaces current navigate())         |          |
+-----+---------------------------------------+----------+
| 5   | Convert all callbacks to send()       | 1 hour   |
|     | (xr, keyboard, menu, audio)           |          |
+-----+---------------------------------------+----------+
| 6   | Remove navigate() + old callback      | 30 min   |
|     | wiring from router                    |          |
+-----+---------------------------------------+----------+
| 7   | Test all flows end-to-end in headset  | 1 hour   |
+-----+---------------------------------------+----------+
|     | Total                                 | ~7 hours |
+-----+---------------------------------------+----------+
```

Most of the work is in task 4 — the enter/exit handlers must do everything the
current `navigate()` and page constructors do, but organized by state rather than
by page module.

The primitive itself (task 1) is ~40 lines. The transition table (task 2) is ~30
lines. The conceptual overhead is low; the mechanical work of rewiring callbacks
is moderate.

## Comparison with Current game-state.ts

The existing `game-state.ts` already models phases (menu, playing, paused, results)
with guarded transitions (e.g. `if (state.phase !== 'playing') invalidTransition('pause')`).
The FSM pattern generalizes this to the entire app:

- `game-state.ts` guards individual method calls. The FSM replaces method calls with
  a single `send()` + transition table.
- `game-state.ts` fires callbacks synchronously from within the mutating method. The
  FSM defers all side effects to the tick.
- `game-state.ts` lives inside the arena page. The FSM lives at the app level and
  subsumes the router.

The existing code is halfway to this pattern. The FSM makes it explicit and moves
the processing boundary to the render loop.
