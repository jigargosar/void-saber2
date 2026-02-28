import { type Seconds, type System, type Teardown } from './types'

// ── Event queue ──────────────────────────────────────────────

interface EventQueue<T> {
    push: (event: T) => void
    flush: () => void
    dispose: Teardown
}

/**
 * Typed event queue. Simple buffer + flush.
 * Single-consumer: one handler dispatches to all concerns.
 * Pipeline calls flush() at end of frame automatically.
 */
export function createEventQueue<T>(handler: (event: T) => void): EventQueue<T> {
    const queue: T[] = []
    return {
        push: (event: T) => { queue.push(event) },
        flush: () => {
            for (let i = 0; i < queue.length; i++) handler(queue[i])
            queue.length = 0
        },
        dispose: () => { queue.length = 0 },
    }
}

// ── System pipeline ──────────────────────────────────────────

/**
 * Ordered system runner. Systems run first, then all queues flush.
 * Consumer can't forget to flush or flush in wrong order.
 */
export function createPipeline(systems: System[], queues?: { flush(): void }[]): System {
    return (dt: Seconds) => {
        for (const system of systems) system(dt)
        if (queues) for (const q of queues) q.flush()
    }
}
