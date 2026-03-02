import { type MusicComposition, type BeatTimeline } from './music-types'

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
