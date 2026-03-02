Lobby Environment — Lighting & Atmosphere Analysis

Source: docs/reference/lobby-screen.webp

## Lighting Model

The entire atmospheric mood comes from a single heavy spotlight
interacting with fog. No skybox, no gradient textures — just
physical lighting.

Spotlight placement:
- Mounted high above and slightly behind the menu panels
- Points downward and slightly forward
- Creates the bright blue/teal gradient visible in front of the player
- Light spills below the ground plane, creating a sense of void/depth
  at the bottom

The apparent gradient (sky blue bottom half → purple top half) is
emergent from the spotlight cone + fog scattering, not a painted
backdrop. The gradient wraps around the player in a curved envelope,
not a flat wall — matching the curved panel arrangement.

## Fog

- Heavy exponential fog throughout the scene
- Thicker near the ground, thinner higher up
- Obscures all distant geometry — nothing has sharp edges far away
- Scatters the spotlight to produce the atmospheric gradient
- Creates natural depth without detailed geometry

## Ground Plane

- Floor surface exists but is very dark, barely visible
- Rectangular glowing wireframe border on the ground
- The spotlight grazing the floor at steep angle gives subtle visibility
- Below the floor, light continues downward → void depth illusion

## Distant Box Geometry

Scattered box clusters serve as depth cues:
- Grouped in chunks of varying sizes (not individual boxes)
- Placed asymmetrically — organic, not gridded
- Sit on the ground plane, reinforcing "floor exists" without a
  visible floor surface
- Edge geometry is darker (away from spotlight cone)

Boxes appear in multiple zones:
- Away from spotlight (sides, behind) → dark silhouettes
- Behind the player at varying distances → dark background effect
  since no spotlight reaches there
- The asymmetric placement and size variation prevents artificial feel

## Color Zones

Front (spotlight lit):
- Bright blue/teal atmosphere from spotlight through fog
- UI panels catch subtle top-edge highlight from the light above

Sides:
- Rapid falloff from spotlight cone edge
- Transition from blue/teal to dark purple

Behind player:
- No spotlight → naturally dark
- Distant boxes visible only as dark shapes
- Purple/dark ambient only

Above:
- Bright bloom at top center where spotlight source is
- Transitions to darker purple away from the light

Below ground:
- Spotlight spills through → depth/void feeling
- Blue-ish glow fading downward

## Particles

- Slow-drifting blue particles moving across the scene
- Low density, subtle
- Lit by the spotlight (brighter in front, dimmer on sides/behind)

## Implementation Notes

Babylon.js approach:
- SpotLight from above/behind menu area, pointing down
- Exponential fog (scene.fogMode = FOGMODE_EXP2)
- Fog color matching the dark purple ambient
- Scattered box meshes (unlit material or very dark diffuse)
  grouped in clusters at various distances
- Ground plane (very dark material) with emissive wireframe border
- GlowLayer for the border and UI panel edges
- Particle system for blue drifting particles
- The spotlight color (blue/teal) + fog interaction should produce
  the gradient naturally without manual color work
