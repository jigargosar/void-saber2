Koota ECS — Traits & Relations Reference
Pinned to koota@1.1.1

## Concepts Cheatsheet

```
+-----+=======================+=============================================+
| #   | Concept               | Summary                                     |
+-----+=======================+=============================================+
|     | BUILDING BLOCKS                                                     |
+-----+-----------------------+---------------------------------------------+
| 1   | trait (schema)        | Flat primitive data, SoA storage,           |
|     |                       | get() returns snapshot                      |
+-----+-----------------------+---------------------------------------------+
| 2   | trait (callback)      | Function returning object, AoS storage,     |
|     |                       | get() returns reference                     |
+-----+-----------------------+---------------------------------------------+
| 3   | trait (tag)           | No data, boolean presence flag              |
+-----+-----------------------+---------------------------------------------+
| 4   | entity                | Number encoding world+generation+id,        |
|     |                       | auto-recycled, decode with entity.id()      |
+-----+-----------------------+---------------------------------------------+
| 5   | world                 | Top-level container, stores all data,       |
|     |                       | entities don't hold data themselves          |
+-----+-----------------------+---------------------------------------------+
| 6   | trait record          | State of one entity-trait pair.              |
|     |                       | SoA = snapshot, AoS = ref                   |
+-----+-----------------------+---------------------------------------------+
| 7   | world traits          | Singletons/global resources,                |
|     |                       | NOT queryable                               |
+-----+-----------------------+---------------------------------------------+
|     | QUERYING                                                            |
+-----+-----------------------+---------------------------------------------+
| 8   | query                 | Find entities sharing a set of traits       |
+-----+-----------------------+---------------------------------------------+
| 9   | defineQuery           | Pre-cached query, avoids hashing overhead   |
+-----+-----------------------+---------------------------------------------+
| 10  | updateEach            | Iterate + mutate, writes back, fires        |
|     |                       | change detection                            |
+-----+-----------------------+---------------------------------------------+
| 11  | readEach              | Read-only iteration, no change detection    |
+-----+-----------------------+---------------------------------------------+
| 12  | forEach / for..of     | Standard entity iteration                   |
+-----+-----------------------+---------------------------------------------+
| 13  | select                | Narrow which traits updateEach receives     |
+-----+-----------------------+---------------------------------------------+
| 14  | useStores             | Direct SoA array access, max perf,          |
|     |                       | bypasses safety                             |
+-----+-----------------------+---------------------------------------------+
| 15  | queryFirst            | Returns first matching entity or undefined  |
+-----+-----------------------+---------------------------------------------+
| 16  | IsExcluded            | Built-in tag, hides entity from all queries |
+-----+-----------------------+---------------------------------------------+
|     | QUERY MODIFIERS                                                     |
+-----+-----------------------+---------------------------------------------+
| 17  | Not(T)                | Exclude entities with trait T               |
+-----+-----------------------+---------------------------------------------+
| 18  | Or(A, B)              | Logical OR (default is AND)                 |
+-----+-----------------------+---------------------------------------------+
| 19  | Added(T)              | Gained T since last query run (stateful)    |
+-----+-----------------------+---------------------------------------------+
| 20  | Removed(T)            | Lost T since last query run (stateful)      |
+-----+-----------------------+---------------------------------------------+
| 21  | Changed(T)            | T changed since last query run (stateful)   |
+-----+-----------------------+---------------------------------------------+
|     | EVENTS                                                              |
+-----+-----------------------+---------------------------------------------+
| 22  | onAdd                 | After trait data is set on entity            |
+-----+-----------------------+---------------------------------------------+
| 23  | onRemove              | Before trait data is removed from entity     |
+-----+-----------------------+---------------------------------------------+
| 24  | onChange              | After set() or entity.changed()             |
+-----+-----------------------+---------------------------------------------+
| 25  | onQueryAdd            | Entity gains all traits in query set        |
+-----+-----------------------+---------------------------------------------+
| 26  | onQueryRemove         | Entity loses any trait in query set          |
+-----+-----------------------+---------------------------------------------+
|     | CHANGE DETECTION                                                    |
+-----+-----------------------+---------------------------------------------+
| 27  | changeDetection       | updateEach option: 'auto' | 'always' |      |
|     |                       | 'never'. Shallow compares scalars.          |
+-----+-----------------------+---------------------------------------------+
| 28  | entity.changed()      | Manual change flag for AoS mutations        |
+-----+-----------------------+---------------------------------------------+
|     | RELATIONS                                                           |
+-----+-----------------------+---------------------------------------------+
| 29  | relation              | Directed edge between entities              |
+-----+-----------------------+---------------------------------------------+
| 30  | relation({ store })   | Relation carrying per-pair data             |
+-----+-----------------------+---------------------------------------------+
| 31  | exclusive             | One target max, new add replaces old        |
+-----+-----------------------+---------------------------------------------+
| 32  | autoDestroy           | 'orphan'/'source': destroy sources when     |
|     |                       | target dies. 'target': reverse.             |
+-----+-----------------------+---------------------------------------------+
| 33  | ordered (experimental)| Maintains ordered list of related entities,  |
|     |                       | bidirectional sync with push/splice         |
+-----+-----------------------+---------------------------------------------+
| 34  | targetsFor / targetFor| Get all / first relation targets             |
+-----+-----------------------+---------------------------------------------+
| 35  | Wildcard / '*'        | Query any target: Contains('*'),            |
|     |                       | Wildcard(entity)                            |
+-----+-----------------------+---------------------------------------------+
|     | ACTIONS                                                             |
+-----+-----------------------+---------------------------------------------+
| 36  | createActions         | Safe world mutation bundle                  |
+-----+-----------------------+---------------------------------------------+
|     | UTILITIES                                                           |
+-----+-----------------------+---------------------------------------------+
| 37  | unpackEntity          | Decode entity into entityId, generation,    |
|     |                       | worldId                                     |
+-----+-----------------------+---------------------------------------------+
| 38  | getStore              | Low-level direct store access (debugging)   |
+-----+-----------------------+---------------------------------------------+
| 39  | TraitRecord<T>        | TypeScript type for trait state              |
+-----+-----------------------+---------------------------------------------+
```

## Traits

Traits are named slices of data attached to entities. Koota's word for "components" in ECS.

```ts
import { trait } from 'koota'

const Position = trait({ x: 0, y: 0 })   // schema-based
const Mesh = trait(() => new THREE.Mesh()) // callback-based
const IsEnemy = trait()                    // tag (no data)
```

### Three Forms

Schema-based — flat object, primitive defaults. Stored as **Structure of Arrays (SoA)**.

```ts
const Position = trait({ x: 0, y: 0, z: 0 })
// Internally: { x: [0,0,0,...], y: [0,0,0,...], z: [0,0,0,...] }
```

`entity.get()` returns a **snapshot** — new object each call.

Callback-based — function returning any object. Stored as **Array of Structures (AoS)**.

```ts
const Mesh = trait(() => new THREE.Mesh())
// Internally: [Mesh, Mesh, Mesh, ...]
```

`entity.get()` returns a **reference** — same object every call.

Tag — no data, boolean presence marker.

```ts
const IsActive = trait()
```

### SoA vs AoS

```
+-----+====================+======================+
| #   | Schema (SoA)       | Callback (AoS)       |
+-----+====================+======================+
| 1   | get() = snapshot   | get() = reference    |
+-----+--------------------+----------------------+
| 2   | Flat numeric data, | Class instances,     |
|     | tight loops        | complex objects      |
+-----+--------------------+----------------------+
| 3   | Use entity.set()   | Can mutate directly, |
|     |                    | call entity.changed()|
|     |                    | for change detection |
+-----+--------------------+----------------------+
```

### Entity Operations

```ts
const e = world.spawn(Position({ x: 5, y: 10 }), IsEnemy)

e.get(Position)                                    // read
e.set(Position, { x: 20, y: 30 })                 // write (partial)
e.set(Position, p => ({ x: p.x + 1, y: p.y }))   // write (callback)
e.has(IsEnemy)                                     // check
e.remove(IsEnemy)                                  // remove
e.destroy()                                        // destroy entity
```

### World Traits (Singletons)

Global resources. Not queryable.

```ts
const Time = trait({ delta: 0, elapsed: 0 })

world.add(Time)
world.set(Time, { delta: dt })
const time = world.get(Time)
```

### Querying

```ts
for (const entity of world.query(Position, Velocity)) {
  const pos = entity.get(Position)
}
```

Iteration helpers:

```ts
// updateEach — writes back, triggers change detection
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
})

// readEach — read-only, no change detection
world.query(Position).readEach(([pos], entity) => {
  console.log(pos.x)
})

// select — narrow which traits you update
world.query(Position, Velocity, Mass)
  .select(Mass)
  .updateEach(([mass]) => { mass.value += 1 })

// useStores — direct SoA array access, max performance
world.query(Position, Velocity).useStores(([pos, vel], entities) => {
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i].id()
    pos.x[eid] += vel.x[eid]
  }
})
```

### Query Modifiers

```ts
import { Not, createAdded, createRemoved, createChanged } from 'koota'

world.query(Position, Not(Velocity))      // has Position but NOT Velocity

const Added = createAdded()
world.query(Added(Position))              // entities that just gained Position

const Changed = createChanged()
world.query(Changed(Position))            // entities whose Position changed

const Removed = createRemoved()
world.query(Removed(Velocity))            // entities that just lost Velocity
```

`Added`, `Removed`, `Changed` are **stateful** — track diffs between invocations, reset after each run. Each needs its own instance via `create*()`.

### Change Detection

`updateEach` has a `changeDetection` option:

```ts
world.query(Position).updateEach(
  ([pos]) => { pos.x += 1 },
  { changeDetection: 'never' }   // suppress events
)
// Also: 'auto' (default, compares before/after), 'always' (always fires)
```

For AoS traits mutated directly, manually flag changes:

```ts
entity.set(BeatPulse, { intensity: 1 })       // triggers onChange
// OR
pulse.intensity = 1; entity.changed()          // manual flag
```

### Events

```ts
world.onAdd(Position, (entity) => { /* after data is set */ })
world.onRemove(Position, (entity) => { /* before data is removed */ })
world.onChange(Position, (entity) => { /* after set() or changed() */ })

// Composite query events
world.onQueryAdd([Position, Velocity], (entity) => { /* gained both */ })
world.onQueryRemove([Position, Velocity], (entity) => { /* lost one or both */ })
```

All return an unsubscribe function.

### TypeScript Typing

```ts
// Explicit generic
type AttackerSchema = { continueCombo: boolean | null; currentStageIndex: number | null }
const Attacker = trait<AttackerSchema>({ continueCombo: null, currentStageIndex: null })

// Extract record type from a trait
type PositionRecord = TraitRecord<typeof Position>
```

---

## Relations

Relations are **traits that connect one entity to another**. Where a trait says "this entity *has* data", a relation says "this entity *relates to* that entity".

```ts
import { relation } from 'koota'

const ChildOf = relation()
```

### Basic Usage

```ts
const parent = world.spawn()
const child = world.spawn(ChildOf(parent))  // child → parent

child.has(ChildOf(parent))   // true
child.targetsFor(ChildOf)    // [parent]  — all targets
child.targetFor(ChildOf)     // parent    — first/only target
```

Multiple targets:

```ts
inventory.add(Contains(gold))
inventory.add(Contains(silver))
inventory.targetsFor(Contains)  // [gold, silver]
```

### Relations with Data

Each relation-target pair has its own independent data:

```ts
const Contains = relation({ store: { amount: 0 } })

inventory.add(Contains(gold))
inventory.set(Contains(gold), { amount: 10 })
inventory.get(Contains(gold))  // { amount: 10 }
```

### Querying Relations

```ts
world.query(Contains(gold))       // entities containing gold specifically
world.query(Contains('*'))        // entities containing anything (wildcard)

import { Wildcard } from 'koota'
world.query(Wildcard(gold))       // entities related to gold by ANY relation
```

### Relation Options

**`exclusive`** — at most one target. Adding a new one replaces the old:

```ts
const Targeting = relation({ exclusive: true })

hero.add(Targeting(rat))
hero.add(Targeting(goblin))
hero.has(Targeting(rat))     // false — replaced
hero.has(Targeting(goblin))  // true
```

**`autoRemoveTarget`** — destroying the target cascades to dependents:

```ts
const ChildOf = relation({ autoRemoveTarget: true })

const parent = world.spawn()
const child = world.spawn(ChildOf(parent))
parent.destroy()
world.has(child)  // false — child destroyed too
```

### Removing Relations

```ts
player.remove(Likes(apple))     // remove specific
player.remove(Likes('*'))       // remove all of this type
```

### Events

Same system as traits, but callback receives both source and target:

```ts
world.onAdd(ChildOf, (entity, target) => { /* ... */ })
```

### Mental Model

```
Traits    = properties on a node
Relations = directed edges between nodes, optionally carrying edge data
exclusive = at most one outgoing edge of this type
autoRemoveTarget = destroying a node cascades to dependents
```

### When to Use Relations

The pattern: any time you'd reach for a foreign key, a lookup table, or a parent
ID field — use a relation instead. You get type-safe querying, automatic cleanup,
and no manual bookkeeping.

**Scene graphs / hierarchies** — parent-child transforms. `ChildOf` with
`autoRemoveTarget` gives cascading destroy for free. Destroying a spaceship
destroys its turrets.

**Inventory / containment** — `Contains` with `store: { amount: 0 }` models
"entity A holds 10 of entity B" without a separate inventory data structure.

**Targeting / combat** — `Targeting` with `exclusive: true` means a unit can only
lock onto one enemy. Re-targeting just calls `add()` again — no manual cleanup.

**Equipment slots** — `EquippedOn(player)` lets you query all equipped items for a
player, or wildcard `EquippedOn('*')` for all equipped items globally.
