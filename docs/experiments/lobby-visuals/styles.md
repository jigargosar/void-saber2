VR Lobby Environment Styles

# void-cathedral

Mood: Ancient, reverent emptiness — standing inside a vast dark cathedral that hums with dormant energy.

Color palette:
- Deep indigo `#1a0a2e` (void fill)
- Warm gold `#d4a017` (light accents)
- Slate purple `#3d2c5e` (stone surfaces)
- Bone white `#e8dcc8` (edge highlights)

Key geometry: Towering pointed arches recede into darkness on both sides, ribbed vaulting overhead disappearing into shadow. Thick round pillars at regular intervals, each 8-10x player height. Floor is a single reflective dark plane with faint grid seams suggesting massive stone tiles. Behind the player, the space opens into pure black — no back wall visible.

Lighting: A single warm directional light angled downward from above-forward (like sunlight through an unseen rose window), casting long pillar shadows behind the player. Faint gold point lights at the base of each pillar. Overall intensity low — most of the space lives in shadow.

Atmosphere: Dense volumetric fog starting at mid-distance, swallowing the far pillars. Slow-drifting dust motes caught in the main light beam. Faint golden glow halos around pillar base lights. No particles beyond dust.


# neon-grid

Mood: Retro-futuristic wireframe void — Tron-like precision with electric color on pure black.

Color palette:
- True black `#000000` (void)
- Hot cyan `#00f0ff` (primary grid lines)
- Magenta `#ff00aa` (accent lines)
- White `#ffffff` (intersection points)

Key geometry: Infinite flat grid plane extending in all directions underfoot, lines glowing against black. Vertical columns of thin wireframe rectangles rise at grid intersections in the mid-distance, varying heights (3x-12x player height), slowly rotating on their vertical axis. No ceiling — open black void above. Horizon line is a bright cyan strip where grid meets void.

Lighting: No directional light. All illumination is emissive — grid lines, wireframe edges, and intersection dots are self-lit. Faint bloom on all emissive surfaces. The player and menu panel are lit only by the ambient glow bouncing off nearby geometry.

Atmosphere: No fog. Subtle scanline effect on the grid (alternating line brightness). Tiny white point particles drift upward slowly from random grid intersections, fading out after 2-3 meters of travel. Horizon glow bleeds slightly upward into the void.


# crystal-cavern

Mood: Alien underground grotto — organic, mineral, cold beauty with refracted light.

Color palette:
- Deep teal `#0a2e2e` (cave walls)
- Ice blue `#7fdbff` (crystal faces)
- Pale violet `#c4a8ff` (secondary crystals)
- Warm amber `#ffb347` (backlight source)
- Near-black green `#0d1f1a` (floor)

Key geometry: Irregular rocky walls close in on the sides (3-4m away), textured with jagged low-poly facets. Large hexagonal crystal formations jut from walls and floor at angles — clusters of elongated hexagonal prisms, varying scale (knee-height to overhead). Ceiling is low and uneven (3-4m), with stalactite-like crystal clusters pointing down. Floor is rough and slightly uneven, darker than walls.

Lighting: Primary light is a warm amber glow from behind the largest crystal cluster (off to one side and slightly behind the player), creating strong silhouettes. Crystals act as secondary emissive sources — ice blue and pale violet, casting colored light onto nearby rock surfaces. Shadows are hard-edged and dramatic.

Atmosphere: Thin blue-tinted fog hugging the floor (knee height). Faint sparkle particles suspended in the air, catching light — very slow drift, almost stationary. Caustic-like light patterns projected onto cave walls from crystal refraction (can be faked with animated projected texture).


# floating-monoliths

Mood: Surreal open sky with massive silent geometry — dreamlike scale that dwarfs the player.

Color palette:
- Dusk orange `#e8651a` (sky gradient bottom)
- Deep navy `#0b1a3d` (sky gradient top)
- Matte charcoal `#2a2a2a` (monolith surfaces)
- Soft peach `#ffcba4` (rim light on geometry)
- Pale yellow `#fff4c1` (distant light source)

Key geometry: The player stands on a single floating rectangular platform (10m x 10m), edges visible — open sky in all directions below and around. Massive rectangular monoliths (20-50m tall, 5-10m wide) float at varying distances and heights in the surrounding space, slowly rotating or tilting on one axis. Some are nearby (10-15m), others far (50-100m, hazy). All are simple box shapes with slightly beveled edges. No ground plane visible below — just gradient sky fading to dark.

Lighting: Strong warm directional light from the horizon (sunset angle), catching monolith edges with bright peach rim light while their facing surfaces stay in deep shadow. Sky itself provides ambient fill — warm below, cool above. Platform the player stands on is lit from above by a soft invisible fill light.

Atmosphere: Layered distance fog — monoliths beyond 40m are progressively desaturated and silhouetted. Slow-moving cloud wisps drift between monoliths at various heights (flat billboard planes with alpha). Faint god rays from the horizon light source. Wind-like subtle particle drift (tiny dots moving horizontally).


# deep-ocean

Mood: Abyssal ocean floor — bioluminescent life in crushing dark stillness.

Color palette:
- Abyss black `#040810` (water void)
- Bio-green `#39ff8e` (primary bioluminescence)
- Electric blue `#1e56ff` (secondary bioluminescence)
- Murky teal `#0f3b3b` (mid-water)
- Soft pink `#ff6b9d` (accent organisms)

Key geometry: Sandy floor with gentle undulations, scattered with rounded rocks and low coral-like branching structures (procedural L-system shapes, 0.5-2m tall). Tall kelp-like ribbons sway gently, anchored at floor, reaching 4-5m high, translucent. In the mid-distance, larger organic arches curve overhead — rib-like structures suggesting a massive skeleton half-buried in sand. No walls or ceiling — open dark water in all directions, depth suggested by color falloff.

Lighting: No global directional light. All illumination comes from bioluminescent sources — small glowing orbs dotting the coral structures (green), pulsing slowly. Larger jellyfish-like shapes drift at mid-height, emitting soft blue-pink light that illuminates nearby geometry. The menu panel area gets a focused pool of light from a cluster of bio-orbs gathered above it.

Atmosphere: Heavy dark fog with short draw distance (15-20m), creating claustrophobic visibility. Slow-moving particle field suggesting marine snow — tiny white dots drifting gently downward. Occasional ripple of faint caustic light on the sand floor from unseen surface far above. Bioluminescent pulses create subtle light waves that propagate outward from organisms.
