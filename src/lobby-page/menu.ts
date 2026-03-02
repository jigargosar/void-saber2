import { type Scene } from '@babylonjs/core/scene'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Vector3 } from '@babylonjs/core/Maths/math'
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture'
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock'
import { Button } from '@babylonjs/gui/2D/controls/button'
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel'
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle'
import { RadioButton } from '@babylonjs/gui/2D/controls/radioButton'
import { Control } from '@babylonjs/gui/2D/controls/control'
import { type Seed, type Difficulty, type Teardown } from '../types'

// ── Song catalog ─────────────────────────────────────────────────

const SONG_CATALOG = [
    { seed: 42 as Seed, name: 'Neon Pulse' },
    { seed: 1337 as Seed, name: 'Dark Matter' },
    { seed: 7890 as Seed, name: 'Cyber Storm' },
    { seed: 25000 as Seed, name: 'Void Walker' },
    { seed: 55555 as Seed, name: 'Neural Drift' },
] as const

// ── Colors (dark purple/blue corridor theme) ─────────────────────

const BG_COLOR = 'rgba(8, 4, 24, 0.92)'
const ACCENT = '#00e5ff'
const ACCENT_DIM = '#00809a'
const ACCENT_PINK = '#f500b3'
const TEXT_COLOR = '#e0e0e0'
const SELECTED_BG = 'rgba(0, 229, 255, 0.15)'
const HOVER_BG = 'rgba(0, 229, 255, 0.08)'
const FONT = 'Consolas, monospace'

// ── Menu panel dimensions ────────────────────────────────────────

const PANEL_WIDTH = 2          // meters
const PANEL_HEIGHT = 1.5       // meters
const PANEL_Y = 1.4            // eye level
const PANEL_Z = -3             // 3m in front of player
const PANEL_TILT_X = 0.1       // slight tilt toward player (radians)
const TEXTURE_WIDTH = 1024
const TEXTURE_HEIGHT = 768

// ── Public interface ─────────────────────────────────────────────

export interface Menu {
    onPlay(callback: (seed: Seed, difficulty: Difficulty) => void): Teardown
    dispose: Teardown
}

export function createMenu(scene: Scene): Menu {
    // State
    let selectedSongIndex = 0
    let selectedDifficulty: Difficulty = 'medium'
    const playListeners = new Set<(seed: Seed, difficulty: Difficulty) => void>()

    // 3D plane for GUI
    const plane = MeshBuilder.CreatePlane('menuPlane', {
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
    }, scene)
    plane.position = new Vector3(0, PANEL_Y, PANEL_Z)
    plane.rotation.y = Math.PI          // face toward player (camera at z=0)
    plane.rotation.x = PANEL_TILT_X

    // GUI texture
    const texture = AdvancedDynamicTexture.CreateForMesh(
        plane,
        TEXTURE_WIDTH,
        TEXTURE_HEIGHT,
    )

    // ── Root container ───────────────────────────────────────────

    const root = new Rectangle('menuRoot')
    root.width = 1
    root.height = 1
    root.background = BG_COLOR
    root.color = ACCENT_DIM
    root.thickness = 2
    root.cornerRadius = 8
    texture.addControl(root)

    const layout = new StackPanel('menuLayout')
    layout.width = '90%'
    layout.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
    layout.paddingTopInPixels = 30
    root.addControl(layout)

    // ── Title ────────────────────────────────────────────────────

    const title = new TextBlock('menuTitle', 'VOID SABER')
    title.fontFamily = FONT
    title.fontSize = 52
    title.color = ACCENT
    title.heightInPixels = 70
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    layout.addControl(title)

    addSpacer(layout, 20)

    // ── Song list ────────────────────────────────────────────────

    const songButtons: Rectangle[] = []

    for (let i = 0; i < SONG_CATALOG.length; i++) {
        const song = SONG_CATALOG[i]
        const row = createSongRow(song.name, i === selectedSongIndex)
        songButtons.push(row)

        row.onPointerClickObservable.add(() => {
            selectedSongIndex = i
            updateSongSelection()
        })
        row.onPointerEnterObservable.add(() => {
            if (i !== selectedSongIndex) row.background = HOVER_BG
        })
        row.onPointerOutObservable.add(() => {
            if (i !== selectedSongIndex) row.background = 'transparent'
        })

        layout.addControl(row)
    }

    function updateSongSelection(): void {
        for (let i = 0; i < songButtons.length; i++) {
            const isSelected = i === selectedSongIndex
            songButtons[i].background = isSelected ? SELECTED_BG : 'transparent'
            songButtons[i].color = isSelected ? ACCENT : ACCENT_DIM
        }
    }

    addSpacer(layout, 16)

    // ── Difficulty selector ──────────────────────────────────────

    const diffLabel = new TextBlock('diffLabel', 'DIFFICULTY')
    diffLabel.fontFamily = FONT
    diffLabel.fontSize = 20
    diffLabel.color = TEXT_COLOR
    diffLabel.heightInPixels = 30
    diffLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
    layout.addControl(diffLabel)

    addSpacer(layout, 8)

    const diffRow = new StackPanel('diffRow')
    diffRow.isVertical = false
    diffRow.heightInPixels = 40
    diffRow.widthInPixels = TEXTURE_WIDTH * 0.85
    layout.addControl(diffRow)

    const difficulties: Difficulty[] = ['easy', 'medium', 'hard']
    for (const diff of difficulties) {
        const radioContainer = new StackPanel(`radio_${diff}`)
        radioContainer.isVertical = false
        radioContainer.widthInPixels = 180
        radioContainer.heightInPixels = 36

        const radio = new RadioButton(`radioBtn_${diff}`)
        radio.widthInPixels = 20
        radio.heightInPixels = 20
        radio.color = ACCENT
        radio.background = BG_COLOR
        radio.isChecked = diff === selectedDifficulty
        radio.group = 'difficulty'
        radio.onIsCheckedChangedObservable.add((checked) => {
            if (checked) selectedDifficulty = diff
        })
        radioContainer.addControl(radio)

        const label = new TextBlock(`radioLabel_${diff}`, diff.toUpperCase())
        label.fontFamily = FONT
        label.fontSize = 18
        label.color = TEXT_COLOR
        label.widthInPixels = 140
        label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
        label.paddingLeftInPixels = 8
        radioContainer.addControl(label)

        diffRow.addControl(radioContainer)
    }

    addSpacer(layout, 16)

    // ── High score display (mock) ────────────────────────────────

    const scoreDisplay = new TextBlock('scoreDisplay', 'High Score: --    Streak: --')
    scoreDisplay.fontFamily = FONT
    scoreDisplay.fontSize = 20
    scoreDisplay.color = ACCENT_DIM
    scoreDisplay.heightInPixels = 30
    scoreDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    layout.addControl(scoreDisplay)

    addSpacer(layout, 24)

    // ── Play button ──────────────────────────────────────────────

    const playBtn = Button.CreateSimpleButton('playBtn', 'P L A Y')
    playBtn.widthInPixels = 280
    playBtn.heightInPixels = 60
    playBtn.fontFamily = FONT
    playBtn.fontSize = 28
    playBtn.color = BG_COLOR
    playBtn.background = ACCENT
    playBtn.cornerRadius = 6
    playBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER
    playBtn.onPointerClickObservable.add(() => {
        const song = SONG_CATALOG[selectedSongIndex]
        for (const cb of playListeners) {
            cb(song.seed, selectedDifficulty)
        }
    })
    playBtn.onPointerEnterObservable.add(() => { playBtn.background = ACCENT_PINK })
    playBtn.onPointerOutObservable.add(() => { playBtn.background = ACCENT })
    layout.addControl(playBtn)

    // ── Public handle ────────────────────────────────────────────

    return {
        onPlay(callback) {
            playListeners.add(callback)
            return () => { playListeners.delete(callback) }
        },

        dispose() {
            playListeners.clear()
            texture.dispose()
            plane.dispose()
        },
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function createSongRow(name: string, selected: boolean): Rectangle {
    const row = new Rectangle(`song_${name}`)
    row.heightInPixels = 44
    row.background = selected ? SELECTED_BG : 'transparent'
    row.color = selected ? ACCENT : ACCENT_DIM
    row.thickness = 1
    row.cornerRadius = 4
    row.paddingBottomInPixels = 4

    const label = new TextBlock(`songLabel_${name}`, name)
    label.fontFamily = FONT
    label.fontSize = 22
    label.color = TEXT_COLOR
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
    label.paddingLeftInPixels = 16
    row.addControl(label)

    return row
}

function addSpacer(parent: StackPanel, heightPx: number): void {
    const spacer = new Rectangle(`spacer_${heightPx}_${Math.random()}`)
    spacer.heightInPixels = heightPx
    spacer.thickness = 0
    parent.addControl(spacer)
}
