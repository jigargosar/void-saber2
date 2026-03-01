Design Patterns — Ideas for Future Use

Not currently implemented. Concepts to reach for when the need arises.

## Event Queue + Pipeline

Extracted from early ECS work. Useful when multiple systems produce events
that other systems consume (e.g. collision → score, collision → particles).

Event queue buffers events during a frame, flushes once at the end.
Pipeline runs systems in order, then flushes all queues — consumer can't
forget to flush or flush in wrong order.

```ts
// Event queue: buffer + flush
interface EventQueue<T> {
    push: (event: T) => void
    flush: () => void
    dispose: Teardown
}

function createEventQueue<T>(handler: (event: T) => void): EventQueue<T>

// Pipeline: ordered system execution + queue flush
function createPipeline(systems: System[], queues?: { flush(): void }[]): System
```

Likely needed around steps 6+ (collision events, scoring, particles).
