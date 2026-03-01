import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math'

const HANDLE_HEIGHT = 0.25
const HANDLE_DIAMETER = 0.035
const BLADE_HEIGHT = 0.8
const BLADE_DIAMETER = 0.03

export function buildSaber(name: string, color: Color3): TransformNode {
    const root = new TransformNode(`${name}Root`)
    root.rotation.x = Math.PI / 2

    const handleMat = new StandardMaterial(`${name}HandleMat`)
    handleMat.diffuseColor = new Color3(0.15, 0.15, 0.18)
    handleMat.specularColor = new Color3(0.3, 0.3, 0.3)

    const handle = MeshBuilder.CreateCylinder(`${name}Handle`, {
        height: HANDLE_HEIGHT,
        diameter: HANDLE_DIAMETER,
        tessellation: 12,
    })
    handle.material = handleMat
    handle.parent = root

    const bladeMat = new StandardMaterial(`${name}BladeMat`)
    bladeMat.emissiveColor = color
    bladeMat.disableLighting = true

    const blade = MeshBuilder.CreateCylinder(`${name}Blade`, {
        height: BLADE_HEIGHT,
        diameter: BLADE_DIAMETER,
        tessellation: 8,
    })
    blade.material = bladeMat
    blade.position.y = HANDLE_HEIGHT / 2 + BLADE_HEIGHT / 2
    blade.parent = root

    return root
}
