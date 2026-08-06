# Urban Prototype Evaluation

## Milestone record

- Branch: `quality-improvement`
- Starting SHA: `f0f4fc1824da5bf4b08f2cfae24e787ba17902ae`
- Urban implementation SHA: `28806a2`
- Production default: unchanged; both urban profiles remain explicit development/test selections.
- Primary candidate: 200×200 m. The 400×400 m profile is an additional scale and instancing stress case, not a second production proposal.

## Prototype and asset sources

The prototype is a mostly flat district built from a connected authored street graph. It uses wide roads, readable intersections, sparse building blocks, broad entrance avenues, open combat space, and gentle driveable ramps to every roof. Cardinal road connectivity selects straight, corner, T-junction, and four-way meshes rather than scattering decorative road pieces at random. The 200 m profile contains 18 buildings and 148 road instances; the 400 m scale test contains 72 buildings and 565 road instances.

Only user-supplied, already-approved packs were used:

- Ultimate Textured Building Pack: buildings, original embedded textures and material assignments.
- Zombie Apocalypse Kit: roads and street furniture only.

The supplied license files identify Quaternius and a CC0 1.0 Universal dedication and are preserved under `docs/quality/licenses/urban-city-maps/`. One Zombie pack text names “Ultimate Platformer Pack” in its body; this source text was preserved exactly. Upstream package metadata should be checked before external distribution if that mismatch matters to release provenance.

## Navigation and collision approach

This phase deliberately did not add a navmesh or rewrite pursuit. The layout instead reduces the failure modes of direct pursuit through broad connected lanes, permeable blocks, limited dead ends, generous ramp widths, and large intersections. Existing obstacle avoidance and flow behavior continue to operate.

Buildings have authoritative rectangular wall footprints, flat rooftop surfaces, and broad ramps matched to roof height. Footprint collision receives entity elevation: walls block at street level and release at rooftop elevation. Tank, enemy, projectile, and camera queries share the same authored surface data. Spawn candidates are rejected when they overlap buildings.

Automated layout tests cover graph connectivity, road-piece correctness, spawn exclusion, asset-family separation, rooftop surfaces, ramp geometry, and opt-in profile selection. The remaining navigation risk is behavioral rather than structural: long horde waves, escorts, bosses, and players can still create congestion or local minima and require a physical multiplayer soak.

## Fair current-versus-urban comparison

The same development build, browser session, 1280×720 viewport, test-mode entry path, Single Player start, renderer settings, and approximately nine-second warm-up were used for both captures. Measurements are rolling samples from the production render loop. Frame interval includes the browser/game loop; render-submit time is CPU time spent submitting the composer/render call and is not a GPU timer. “Estimated scene draw calls” is a visible-scene material/group upper bound, not Three.js/WebGL post-processing telemetry.

| Metric | Current default | Urban 200 | Interpretation |
|---|---:|---:|---|
| Frame interval p50 | 8.3 ms | 8.3 ms | Both held the 120 Hz target in this sample. |
| Frame interval p95 | 8.8 ms | 8.8 ms | No measured tail regression at p95. |
| Frame interval p99 | 10.8 ms | 9.2 ms | Short sample; not evidence that urban is intrinsically faster. |
| Render submit p50 | 1.1 ms | 1.5 ms | Urban adds about 0.4 ms of CPU submission work. |
| Render submit p95 | 1.4 ms | 1.7 ms | Urban adds about 0.3 ms at p95. |
| Estimated visible scene draws | 203 | 95 | Instanced roads and props substantially reduce submissions. |
| Estimated visible triangles | 46,528 | 162,517 | Urban geometry is about 3.5× denser. |
| Renderer geometries | 53 | 56 | Similar geometry-resource count. |
| Renderer textures | 23 | 32 | Nine additional source textures. |

Browser/device: Google Chrome 151 through ANGLE D3D11 on an NVIDIA GeForce RTX 4060 Ti, Windows, 1280×720. These are one-machine results and do not substitute for low-end or integrated-GPU qualification.

## Gameplay and production comparison

| Axis | Current terrain | Urban prototype | Finding |
|---|---|---|---|
| Visual cohesion | The Phase B lighting, fog, and material response make the existing terrain more internally consistent, but its valley forms remain visually generic. | Roads, crosswalks, repeated building language, ramps, and props establish a clearer authored identity. | Urban is stronger. |
| Dash enjoyment | Hills and valleys produce speed changes but can interrupt long readable runs. | Wide connected streets provide deliberate dash lanes and clear braking/turn decisions. | Urban is stronger for sustained dash play. |
| Jump usefulness | Natural ridges create frequent but inconsistent launch opportunities. | Broad roof ramps make jumps legible and goal-oriented, but the flat street field supplies fewer incidental launches. | Hybrid advantage: authored urban ramps plus selective terrain variation. |
| Camera quality | Phase A fixes keep valley descent and ridge movement bounded; large terrain slopes still demand more vertical correction. | Flat streets are calm and readable; rooftop transitions remain within the shared surface/collision model. | Urban is easier to read, current terrain exercises the camera more thoroughly. |
| Monster navigation | Open terrain rarely creates hard obstacle traps. | Wide connected lanes reduce traps, but buildings introduce avoidance and congestion risk. | Current is safer until long-wave urban soak data exists. |
| Spawn readability | Open slopes expose most incoming groups, with some terrain occlusion. | Avenue axes and plazas clearly communicate approach lanes; buildings can intentionally occlude side streets. | Urban is stronger when spawn lanes are authored. |
| Combat readability | Height variation can separate threats but also hide them behind terrain. | Flat roads and strong street markings clarify ranges, silhouettes, and projectile paths. | Urban is stronger. |
| Performance | Lower triangle and texture cost, but more separate scene objects in the measured view. | Higher triangle/texture cost, lower draw-submission estimate through instancing; equal p95 frame interval here. | Acceptable on this machine; lower hardware remains unverified. |
| Boss encounter quality | Natural bowls can contain encounters but have irregular sight lines. | Large intersections/plazas offer readable arena boundaries and escort approach lanes. No boss mechanics were changed. | Urban provides a better arena canvas, not yet a proven encounter. |
| Multiplayer clarity | Terrain height can separate driver/gunner attention and obscure shared callouts. | Named-looking intersections, road axes, and large landmarks make direction and target callouts easier. | Urban is stronger, pending two-client playtest. |
| Art-production effort | Existing procedural terrain is cheap to extend. | Authored graphs, collision surfaces, ramps, asset curation, and QA require materially more work. | Current terrain is cheaper; urban needs reusable generation templates. |

## Visual evidence and human review

- [Current-map fair comparison](evidence/phase-d-current-map.png)
- [Urban-200 fair comparison](evidence/phase-d-urban-200.png)
- [Urban 200 aerial](evidence/urban-city-maps/urban-200-aerial-overview.png)
- [Urban 200 driver](evidence/urban-city-maps/urban-200-driver-view.png)
- [Urban 200 rooftop](evidence/urban-city-maps/urban-200-rooftop-view.png)
- [Urban 400 aerial](evidence/urban-city-maps/urban-400-aerial-overview.png)
- [Urban 400 driver](evidence/urban-city-maps/urban-400-driver-view.png)
- [Urban 400 rooftop](evidence/urban-city-maps/urban-400-rooftop-view.png)

All images were human-reviewed, not only checked for nonblank pixels. The urban captures show coherent connected road markings, distinct building silhouettes, broad navigable ramps, a readable rooftop elevation, and no obvious asset-family mixing. The large ramps are mechanically clear but visually oversized; a later art pass should integrate them with rubble, parking structures, or overpasses without narrowing their usable envelope.

## Known limitations

- No physical two-client urban round, long-wave stuck-enemy study, congestion count, boss/escort reliability study, or reconnect/rematch urban soak was completed in Phase D.
- Performance was measured on one current development GPU only and for short steady-state samples.
- The renderer diagnostics estimate visible scene submissions and triangles; they do not replace a GPU capture.
- The prototype lacks bespoke skyline dressing, destructible urban props, authored spawn telegraphs, and a polished boss arena.
- Direct-pursuit behavior can still become stuck around building corners; this phase intentionally avoided a major navigation rewrite.
- The 400 m profile proves scaling and instancing behavior but is beyond the approximately 200 m milestone target.

## Recommendation

**hybridize with urban elements later**

Keep the current terrain as the production default for this milestone. Continue the 200 m urban profile as an isolated option and use its wide-road language, clear spawn avenues, readable plazas, landmark callouts, and authored jump ramps as the basis of a future hybrid map milestone. Promote or replace only after low-end/mid-range device measurement, a complete two-client round, long horde navigation/congestion data, and boss/escort reliability qualification. The default map and normal matchmaking path remain unchanged.
