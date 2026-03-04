import { type Seconds } from '../types'
import { type MusicComposition } from './music-composer'

export interface BeatTimeline {
    readonly beatTimes: readonly Seconds[]
    readonly totalBeats: number
    readonly totalTime: Seconds
}

const BEATS_PER_BAR = 4

export function extractBeatTimeline(composition: MusicComposition): BeatTimeline {
    const beatTimes: number[] = []

    for (let i = 0; i < composition.totalBars; i++) {
        const barStart = composition.barStartTimes[i]
        const beatDuration = composition.barDurations[i] / BEATS_PER_BAR
        for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
            beatTimes.push(barStart + beat * beatDuration)
        }
    }

    return {
        beatTimes,
        totalBeats: beatTimes.length,
        totalTime: composition.totalTime,
    }
}
