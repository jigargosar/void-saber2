Plan: Music Pipeline (Workstream A)

## Goal

Seed → full procedural song plays with 7 instruments, stage pulses on beats.

## Reference

`docs/reference/music_gen_v2.html` — single source of truth for all generation
logic and synth configs. Port to typed TypeScript modules.

## Implementation

### A1. music-composer.ts

Port reference `generateSong()` (lines 339-558) + all helper functions.

Sections to port (in order, each builds on previous):

1. **Seeded RNG** (lines 70-74)
   - `seedRng(s)`, `rng()`, `rngInt(min, max)`, `pick(arr)`
   - Module-scoped mutable `_seed` — internal, not exported
   - All randomness flows through these 4 functions

2. **Constants** (lines 77-82)
   - BPM_CENTER=128, BPM_RANGE=12, KEY_POOL, VOICE_RANGE, MIN_VEL=0.03

3. **Song structures** (lines 84-111)
   - 5 structures (Standard, Slow Burn, Energetic, Minimal, Epic)
   - Each = array of sections with name, bars, energy
   - Type: `Section { name: string; bars: number; energy: Energy }`

4. **Markov chord progressions** (lines 113-138)
   - 6 numerals: Im, bIII, IVm, Vm, bVI, bVII
   - Weighted transition matrix, `markovNext()`, `generatePhrase()` → 4 chords

5. **Voice leading** (lines 140-149)
   - `minimalMovement(voicings, lastVoicing)` — sort by total MIDI distance
   - Uses tonal: `Note.midi()`, `Voicing.search()`, `VoicingDictionary.triads`

6. **Drum patterns** (lines 152-176)
   - 8 steps per bar, 4 energy levels (low/mid/high/peak), 3 variants each
   - KICK_PATTERNS, SNARE_PATTERNS, HAT_PATTERNS
   - `energyLevel(energy)` maps 0-1 → level name

7. **Arp patterns** (lines 178-199)
   - 4 styles: up, down, updown, random
   - `generateArpPattern(chordNotes, style, energy)` → 8-step pattern with nulls

8. **Melody motif** (lines 201-223)
   - `generateMotif(scaleNotes, length)` — random walk on scale degrees
   - `varyMotif(motif, amount)` — probabilistic nudge
   - `degreeToNote(scaleNotes, degree, octaveBase)` — degree → note name

9. **Energy curve** (lines 225-264)
   - `buildEnergyCurve(structure)` — 3-pass neighbor smoothing + Perlin-like noise
   - Returns { curve, sectionNames } per bar

10. **BPM curve + bar timing** (lines 266-299)
    - `buildBpmCurve(structure)` — base BPM ± nudge per section
    - `buildBarTiming(bpmCurve)` → { barStartTimes, barDurations, totalTime }

11. **Sigmoid instrument activation** (lines 301-328)
    - 7 instruments, 5 orderings, slot thresholds + smoothness
    - `computeVolumes(energy, ordering)` → per-instrument volume 0-1
    - Used during event generation to gate instruments by energy

12. **Event generation** (lines 415-557)
    - Loop over bars, generate events per instrument based on energy/volumes
    - Pad: whole-bar chords with 1.1x duration overlap
    - Bass: energy < 0.4 whole notes, < 0.7 half notes, else 8th-note patterns
    - Drums: pattern lookup by energy level + variant
    - Drum fills: snare rolls at phrase boundaries before energy transitions
    - Arp: pattern from chord notes transposed +12, gated by energy
    - Melody: motif-based, rhythm pattern, energy-gated density
    - `dedup()` — sort by time, remove duplicates at same time

tonal imports (named, from 'tonal'):
```ts
import { Note, Scale, Progression, Voicing, VoiceLeading, VoicingDictionary } from 'tonal'
```

### A2. beat-timeline.ts

Smallest module. ~15 lines.

```ts
function extractBeatTimeline(composition: MusicComposition): BeatTimeline {
    const beatTimes: Seconds[] = []
    for (let i = 0; i < composition.totalBars; i++) {
        const beatDuration = composition.barDurations[i] / 4
        for (let beat = 0; beat < 4; beat++) {
            beatTimes.push(composition.barStartTimes[i] + beat * beatDuration)
        }
    }
    return { beatTimes, totalBeats: beatTimes.length, totalTime: composition.totalTime }
}
```

### A3. music-player.ts

Port reference instrument setup (lines 647-709) and scheduling (lines 711-798).

**Instrument creation** — all configs from reference, no changes:

1. Master: `new Gain(1).connect(getDestination())`
2. Pad: PolySynth → Chorus(.start()) → Filter(LP 1200) → Reverb(3s) → master
3. Bass: MonoSynth → Filter(LP 800, -12) → master
4. Kick: MembraneSynth → master
5. Snare: NoiseSynth → Filter(HP 1200) → master
6. Hat: NoiseSynth → Filter(HP 8000) → master
7. Arp: PolySynth → Filter(LP 3000) → Reverb(1s) → master
8. Melody: Synth → Filter(LP 2200) → Reverb(1.5s) → master

**Scheduling** — one Tone.Part per instrument:

- Pad: `pad.triggerAttackRelease(e.notes, e.duration, time, e.vel)`
- Bass: `bass.triggerAttackRelease(e.note, e.duration, time, e.vel)`
- Kick: `kick.triggerAttackRelease('C1', '8n', time, e.vel)` + onBeat callback
- Snare: `snare.triggerAttackRelease('16n', time, e.vel)`
- Hat: `hat.triggerAttackRelease('32n', time, e.vel)`
- Arp: `arp.triggerAttackRelease(e.note, e.duration, time, e.vel)`
- Melody: `melody.triggerAttackRelease(e.note, e.duration, time, e.vel)`

onBeat fires on kicks: `Tone.getDraw().schedule(() => onBeat(), time)`

**Master fade** — last bar:
```ts
transport.schedule((time) => {
    masterGain.gain.setValueAtTime(1, time)
    masterGain.gain.linearRampToValueAtTime(0, time + lastBarDur)
}, composition.totalTime - lastBarDur)
```

**Dispose order**: parts → synths → effects → master

tone imports (named, from 'tone'):
```ts
import {
    MembraneSynth, NoiseSynth, MonoSynth, PolySynth, Synth,
    Gain, Filter, Chorus, Reverb, Part,
    start as startTone, getDestination, getTransport, getDraw,
} from 'tone'
```

### A4. Wire main.ts

- Import composeMusic, extractBeatTimeline, createMusicPlayer
- Remove createAudioEngine import and usage
- Remove keyboard test triggers
- Compose on load (or on play from menu — for now on load)
- Start player on canvas click
- Wire onBeat → stage.onBeat()

### A5. Delete audio.ts

Replaced entirely by music-player.ts.

## Order

1. music-composer.ts (largest, ~400 lines)
2. beat-timeline.ts (~15 lines)
3. music-player.ts (~150 lines)
4. Wire main.ts + delete audio.ts
5. Typecheck
6. Test in browser

## Verification

1. `pnpm typecheck` passes
2. `pnpm dev` → click canvas → full song plays
3. All 7 instruments audible (pad, bass, kick, snare, hat, arp, melody)
4. Stage pillars/fog pulse on kick beats
5. Song fades out on last bar, stops cleanly
6. Different page loads = different seeds = different songs
7. Console: no errors from tone or tonal
