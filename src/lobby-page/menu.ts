import { type Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Vector3 } from '@babylonjs/core/Maths/math'
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture'
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock'
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel'
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle'
import { Control } from '@babylonjs/gui/2D/controls/control'
import { type Seed, type Difficulty, type Teardown } from '../types'
import { type CommandQueue } from '../command-queue'

// ── Song catalog (hardcoded, will move to music/songs.ts) ────────

const SONGS = [
    { seed: 42 as Seed, name: 'Neon Pulse' },
    { seed: 1337 as Seed, name: 'Dark Matter' },
    { seed: 7890 as Seed, name: 'Cyber Storm' },
    { seed: 25000 as Seed, name: 'Void Walker' },
    { seed: 55555 as Seed, name: 'Neural Drift' },
    { seed: 99999 as Seed, name: 'Shadow Circuit' },
    { seed: 12345 as Seed, name: 'Ambient Flow' },
    { seed: 67890 as Seed, name: 'Slow Burn' },
    { seed: 31415 as Seed, name: 'Deep Fade' },
] as const

// ── Difficulties ────────────────────────────────────────────────

const DIFFICULTIES: readonly { readonly key: Difficulty; readonly label: string }[] = [
    { key: 'easy', label: 'Easy' },
    { key: 'normal', label: 'Normal' },
    { key: 'hard', label: 'Hard' },
    { key: 'expert', label: 'Expert' },
    { key: 'expertPlus', label: 'Expert+' },
]

// ── Colors ───────────────────────────────────────────────────────

const BG_COLOR = 'rgba(8, 4, 24, 0.92)'
const ACCENT = '#00e5ff'
const ACCENT_DIM = '#00809a'
const ACCENT_PINK = '#f500b3'
const TEXT_PRIMARY = '#e0e0e0'
const TEXT_DIM = '#888888'
const SELECTED_BG = 'rgba(0, 229, 255, 0.15)'
const HOVER_BG = 'rgba(0, 229, 255, 0.08)'
const DIFF_SELECTED_BG = 'rgba(0, 229, 255, 0.25)'
const FONT = 'Consolas, monospace'

// ── Panel geometry ───────────────────────────────────────────────

const LEFT_WIDTH = 1.1            // meters
const LEFT_HEIGHT = 1.4
const LEFT_X = -0.65
const RIGHT_WIDTH = 0.9
const RIGHT_HEIGHT = 1.2
const RIGHT_X = 0.6
const PANEL_Y = 1.35              // eye height center
const PANEL_Z = -2.5              // distance from player
const PANEL_TILT = 0.08           // slight tilt toward player (radians)

const LEFT_TEX_W = 880
const LEFT_TEX_H = 1120
const RIGHT_TEX_W = 720
const RIGHT_TEX_H = 960

// ── Public interface ─────────────────────────────────────────────

export interface Menu {
    dispose: Teardown
}

export function createMenu(scene: Scene, queue: CommandQueue): Menu {

    // ── State ────────────────────────────────────────────────────

    let selectedSongIdx = 0
    let selectedDiffIdx = 1   // 'normal' by default

    // ── Left panel (song list) ───────────────────────────────────

    const leftPlane = MeshBuilder.CreatePlane('menuLeft', {
        width: LEFT_WIDTH, height: LEFT_HEIGHT,
    }, scene)
    leftPlane.position = new Vector3(LEFT_X, PANEL_Y, PANEL_Z)
    leftPlane.rotation.y = Math.PI
    leftPlane.rotation.x = PANEL_TILT

    const leftTex = AdvancedDynamicTexture.CreateForMesh(
        leftPlane, LEFT_TEX_W, LEFT_TEX_H,
    )

    const leftRoot = makePanel('leftRoot')
    leftTex.addControl(leftRoot)

    const leftLayout = new StackPanel('leftLayout')
    leftLayout.width = '92%'
    leftLayout.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
    leftLayout.paddingTopInPixels = 30
    leftRoot.addControl(leftLayout)

    // Section title
    const songsTitle = makeText('songsTitle', 'SONGS', 32, TEXT_DIM)
    songsTitle.heightInPixels = 50
    songsTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
    leftLayout.addControl(songsTitle)

    addSpacer(leftLayout, 12)

    // Song rows
    const songRows: Rectangle[] = []

    for (let i = 0; i < SONGS.length; i++) {
        const row = makeSongRow(SONGS[i].name, i === selectedSongIdx)
        songRows.push(row)

        row.onPointerClickObservable.add(() => { selectSong(i) })
        row.onPointerEnterObservable.add(() => {
            if (i !== selectedSongIdx) row.background = HOVER_BG
        })
        row.onPointerOutObservable.add(() => {
            if (i !== selectedSongIdx) row.background = 'transparent'
        })

        leftLayout.addControl(row)
    }

    // ── Right panel (details + actions) ──────────────────────────

    const rightPlane = MeshBuilder.CreatePlane('menuRight', {
        width: RIGHT_WIDTH, height: RIGHT_HEIGHT,
    }, scene)
    rightPlane.position = new Vector3(RIGHT_X, PANEL_Y, PANEL_Z)
    rightPlane.rotation.y = Math.PI
    rightPlane.rotation.x = PANEL_TILT

    const rightTex = AdvancedDynamicTexture.CreateForMesh(
        rightPlane, RIGHT_TEX_W, RIGHT_TEX_H,
    )

    const rightRoot = makePanel('rightRoot')
    rightTex.addControl(rightRoot)

    const rightLayout = new StackPanel('rightLayout')
    rightLayout.width = '88%'
    rightLayout.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
    rightLayout.paddingTopInPixels = 50
    rightRoot.addControl(rightLayout)

    // Selected song title (updates on selection)
    const songTitle = makeText('songTitle', SONGS[0].name, 44, ACCENT)
    songTitle.heightInPixels = 70
    songTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    songTitle.textWrapping = true
    rightLayout.addControl(songTitle)

    addSpacer(rightLayout, 12)

    // "DIFFICULTY" label
    const diffLabel = makeText('diffLabel', 'DIFFICULTY', 20, TEXT_DIM)
    diffLabel.heightInPixels = 35
    diffLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    rightLayout.addControl(diffLabel)

    addSpacer(rightLayout, 8)

    // Difficulty button row
    const diffRow = new StackPanel('diffRow')
    diffRow.isVertical = false
    diffRow.heightInPixels = 55
    diffRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    rightLayout.addControl(diffRow)

    const diffButtons: Rectangle[] = []

    for (let i = 0; i < DIFFICULTIES.length; i++) {
        const btn = makeDiffButton(DIFFICULTIES[i].label, i === selectedDiffIdx)
        diffButtons.push(btn)

        btn.onPointerClickObservable.add(() => { selectDifficulty(i) })
        btn.onPointerEnterObservable.add(() => {
            if (i !== selectedDiffIdx) btn.background = HOVER_BG
        })
        btn.onPointerOutObservable.add(() => {
            if (i !== selectedDiffIdx) btn.background = 'transparent'
        })

        diffRow.addControl(btn)
    }

    addSpacer(rightLayout, 40)

    // High score (mock)
    const scoreLine = makeText('scoreLine', 'HIGH SCORE  --', 22, TEXT_DIM)
    scoreLine.heightInPixels = 35
    scoreLine.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    rightLayout.addControl(scoreLine)

    const streakLine = makeText('streakLine', 'MAX STREAK  --', 22, TEXT_DIM)
    streakLine.heightInPixels = 35
    streakLine.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    rightLayout.addControl(streakLine)

    addSpacer(rightLayout, 40)

    // Play button
    const playBtn = new Rectangle('playBtn')
    playBtn.widthInPixels = 300
    playBtn.heightInPixels = 65
    playBtn.background = ACCENT
    playBtn.cornerRadius = 6
    playBtn.thickness = 0
    playBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    rightLayout.addControl(playBtn)

    const playBtnText = makeText('playBtnText', 'P L A Y', 30, BG_COLOR)
    playBtn.addControl(playBtnText)

    playBtn.onPointerClickObservable.add(() => {
        const song = SONGS[selectedSongIdx]
        queue.enqueue({ type: 'songSelected', seed: song.seed, difficulty: DIFFICULTIES[selectedDiffIdx].key })
    })
    playBtn.onPointerEnterObservable.add(() => { playBtn.background = ACCENT_PINK })
    playBtn.onPointerOutObservable.add(() => { playBtn.background = ACCENT })

    // ── State management ─────────────────────────────────────────

    function selectSong(index: number): void {
        selectedSongIdx = index
        for (let i = 0; i < songRows.length; i++) {
            const selected = i === index
            songRows[i].background = selected ? SELECTED_BG : 'transparent'
            songRows[i].color = selected ? ACCENT : ACCENT_DIM
        }
        songTitle.text = SONGS[index].name
    }

    function selectDifficulty(index: number): void {
        selectedDiffIdx = index
        for (let i = 0; i < diffButtons.length; i++) {
            const selected = i === index
            diffButtons[i].background = selected ? DIFF_SELECTED_BG : 'transparent'
            diffButtons[i].color = selected ? ACCENT : ACCENT_DIM
        }
    }

    // ── Handle ───────────────────────────────────────────────────

    return {
        dispose() {
            leftTex.dispose()
            leftPlane.dispose()
            rightTex.dispose()
            rightPlane.dispose()
        },
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function makePanel(name: string): Rectangle {
    const panel = new Rectangle(name)
    panel.width = 1
    panel.height = 1
    panel.background = BG_COLOR
    panel.color = ACCENT_DIM
    panel.thickness = 1
    panel.cornerRadius = 8
    return panel
}

function makeText(name: string, text: string, size: number, color: string): TextBlock {
    const tb = new TextBlock(name, text)
    tb.fontFamily = FONT
    tb.fontSize = size
    tb.color = color
    return tb
}

function makeSongRow(name: string, selected: boolean): Rectangle {
    const row = new Rectangle(`song_${name}`)
    row.heightInPixels = 100
    row.background = selected ? SELECTED_BG : 'transparent'
    row.color = selected ? ACCENT : ACCENT_DIM
    row.thickness = 1
    row.cornerRadius = 4
    row.paddingBottomInPixels = 6

    const label = makeText(`songLabel_${name}`, name, 30, TEXT_PRIMARY)
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
    label.paddingLeftInPixels = 20
    row.addControl(label)

    return row
}

function makeDiffButton(label: string, selected: boolean): Rectangle {
    const btn = new Rectangle(`diff_${label}`)
    btn.widthInPixels = 120
    btn.heightInPixels = 48
    btn.background = selected ? DIFF_SELECTED_BG : 'transparent'
    btn.color = selected ? ACCENT : ACCENT_DIM
    btn.thickness = 1
    btn.cornerRadius = 4
    btn.paddingLeftInPixels = 4
    btn.paddingRightInPixels = 4

    const text = makeText(`diffText_${label}`, label, 20, TEXT_PRIMARY)
    btn.addControl(text)

    return btn
}

function addSpacer(parent: StackPanel, heightPx: number): void {
    const spacer = new Rectangle(`spacer_${heightPx}_${Math.random()}`)
    spacer.heightInPixels = heightPx
    spacer.thickness = 0
    parent.addControl(spacer)
}
