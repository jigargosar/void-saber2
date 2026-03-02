import { type GamePhase, type Seed, type Difficulty, type Teardown } from './types'

// ── Score data (pure accumulator, consumed by results screen) ────

export interface ScoreState {
    readonly hits: number
    readonly misses: number
    readonly streak: number
    readonly maxStreak: number
}

// ── State machine ────────────────────────────────────────────────

interface MenuState {
    readonly phase: 'menu'
    readonly selectedSeed: Seed | null
    readonly difficulty: Difficulty
}

interface PlayingState {
    readonly phase: 'playing'
    readonly selectedSeed: Seed
    readonly difficulty: Difficulty
}

interface PausedState {
    readonly phase: 'paused'
    readonly selectedSeed: Seed
    readonly difficulty: Difficulty
}

interface ResultsState {
    readonly phase: 'results'
    readonly selectedSeed: Seed
    readonly difficulty: Difficulty
    readonly score: ScoreState
}

type State = MenuState | PlayingState | PausedState | ResultsState

export interface GameStateManager {
    readonly phase: GamePhase
    readonly selectedSeed: Seed | null
    readonly difficulty: Difficulty
    readonly score: ScoreState | null
    selectSong(seed: Seed): void
    setDifficulty(difficulty: Difficulty): void
    startPlaying(): void
    pause(): void
    resume(): void
    restart(): void
    showResults(score: ScoreState): void
    returnToMenu(): void
    onPhaseChange(callback: (phase: GamePhase) => void): Teardown
    dispose: Teardown
}

export function createGameStateManager(): GameStateManager {
    let state: State = { phase: 'menu', selectedSeed: null, difficulty: 'normal' }
    const listeners = new Set<(phase: GamePhase) => void>()

    function firePhaseChange(): void {
        for (const cb of listeners) {
            cb(state.phase)
        }
    }

    function invalidTransition(action: string): never {
        throw new Error(`Invalid transition: ${action} from '${state.phase}'`)
    }

    return {
        get phase() { return state.phase },
        get selectedSeed() { return state.phase === 'menu' ? state.selectedSeed : state.selectedSeed },
        get difficulty() { return state.difficulty },
        get score() { return state.phase === 'results' ? state.score : null },

        selectSong(seed) {
            if (state.phase !== 'menu') invalidTransition('selectSong')
            state = { ...state, selectedSeed: seed }
        },

        setDifficulty(difficulty) {
            if (state.phase !== 'menu') invalidTransition('setDifficulty')
            state = { ...state, difficulty }
        },

        startPlaying() {
            if (state.phase !== 'menu') invalidTransition('startPlaying')
            if (state.selectedSeed === null) throw new Error('No song selected')
            state = { phase: 'playing', selectedSeed: state.selectedSeed, difficulty: state.difficulty }
            firePhaseChange()
        },

        pause() {
            if (state.phase !== 'playing') invalidTransition('pause')
            state = { phase: 'paused', selectedSeed: state.selectedSeed, difficulty: state.difficulty }
            firePhaseChange()
        },

        resume() {
            if (state.phase !== 'paused') invalidTransition('resume')
            state = { phase: 'playing', selectedSeed: state.selectedSeed, difficulty: state.difficulty }
            firePhaseChange()
        },

        // Restart: paused → menu → playing (immediate double transition)
        restart() {
            if (state.phase !== 'paused') invalidTransition('restart')
            const { selectedSeed, difficulty } = state
            state = { phase: 'menu', selectedSeed, difficulty }
            firePhaseChange()
            state = { phase: 'playing', selectedSeed, difficulty }
            firePhaseChange()
        },

        showResults(score) {
            if (state.phase !== 'playing') invalidTransition('showResults')
            state = { phase: 'results', selectedSeed: state.selectedSeed, difficulty: state.difficulty, score }
            firePhaseChange()
        },

        returnToMenu() {
            if (state.phase !== 'paused' && state.phase !== 'results') invalidTransition('returnToMenu')
            state = { phase: 'menu', selectedSeed: state.selectedSeed, difficulty: state.difficulty }
            firePhaseChange()
        },

        onPhaseChange(callback) {
            listeners.add(callback)
            return () => { listeners.delete(callback) }
        },

        dispose() {
            listeners.clear()
        },
    }
}
