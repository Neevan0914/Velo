# VELO: Arcade Street Racing

A browser racing game built with Three.js. Everything is generated in code: the cars, the five cities, their landmarks, the textures and the sound. The project ships no image, model or audio files.

## Run it

```bash
npm install
npm run dev        # open the printed http://localhost:5173 URL
```

To make a production build in `dist/` (any static file host can serve it):

```bash
npm run build
npm run preview
```

The game needs a desktop browser with WebGL 2 (Chrome, Edge, Firefox or Safari), plus a keyboard and mouse.

## How to play

| Key | Action |
| --- | --- |
| **W / S** | Accelerate / brake and reverse |
| **A / D** | Steer |
| **Mouse** | Look around (click the game to capture the mouse) |
| **F** | Nitro |
| **Space** | Handbrake, for drifting through tight corners |
| **C** | Switch camera (chase / hood / far) |
| **R** | Put the car back on the track |
| **Esc** | Pause (resume, restart, quit, graphics quality) |
| **M** | Mute |

### Flow

1. **Main menu.** Your current car turns on a lit turntable on the right, with the red **PLAY** button under it. The **THEME** button on the left changes the backdrop city: Las Vegas, New York, Paris, London or Singapore.
2. **Garage.** After **PLAY**, you choose a car from the curved wheel along the bottom (click a card, use the arrows, scroll, drag, or press A/D). You also pick **one** boost and a **map**. Then press **START RACE**.
3. **Race.** You start at the back of a 6-car grid against 5 bots. After a camera fly-in, the race starts with a **3, 2, 1, GO!** countdown, and the lights on the start gantry light up with it. The race is **3 laps**. The leaderboard is in the top left, lap and times in the top centre, the minimap in the top right, and the speedometer in **km/h** in the bottom right with the nitro gauge.
4. **Results.** You see the finishing order, total times and best laps. You can race again, go back to the garage or return to the main menu.

### Physics and boosts

| | Base | With booster |
| --- | --- | --- |
| Acceleration | 0.75 km/h per tick | **Acceleration** booster: 1.0 |
| Top speed | depends on the car (218–226 km/h) | **Velocity** booster: +15 km/h |
| Nitro cooldown | 15 s | **Nitro** booster: 10 s (−5 s) |

Physics runs at a fixed **60 ticks per second**. At 0.75 km/h per *real second*, a car would need about 4½ minutes to reach top speed. The acceleration values are therefore applied per physics tick, which gives 45 km/h/s base and 60 km/h/s with the Acceleration booster. The ratio between the two values is the same as in the spec. All tuning lives in `src/config.js` (`PHYSICS`). Nitro burns for 3 s and adds +65 km/h on top of your top speed.

## Graphics

- HDR rendering with ACES tone mapping, 4× MSAA, bloom, and a lens pass that adds speed-based radial blur, chromatic aberration, speed lines during nitro, a vignette and film grain.
- Car paint uses a physically based clear-coat material. Some cars also get pearl, iridescent or matte finishes. Cars reflect the actual city through a cube-map captured from each map.
- Car bodies are lofted procedurally, with LED headlights, taillight bars that brighten when braking, wheels that spin and steer, brake calipers, wings, diffusers, underglow, nitro exhaust flames, and body roll and pitch.
- Each city has its own sky shader (sun, moon, stars, clouds), fog and lighting mood, plus neon-trimmed towers, billboards, street lamps with pools of light, trees or palms, a grandstand where camera flashes go off, and a gantry with working start lights.
- Each city has procedural landmarks:
  - **Las Vegas:** an LED sphere, a glass pyramid with a sky beam, and an observation tower.
  - **New York:** an Art Deco setback tower, a crown tower and a twisted supertall.
  - **Paris:** a lattice tower that lights up with sparkles, and a triumphal arch.
  - **London:** a clock tower, an observation wheel by the river, and a glass shard tower.
  - **Singapore:** bay towers with a sky-park laser show, Supertrees, a rainbow wheel and a lotus museum.
- Particles: sparks when you hit walls or other cars, tyre smoke when you slide, and nitro embers.
- The pause menu has a **HIGH / MEDIUM / LOW** graphics setting for slower GPUs.

All car brands and models are fictional.

## Project layout

```
src/
  main.js            game state machine, menus/showcase, input
  config.js          physics tuning, boosts, cars, cities
  gfx/               renderer + post FX, sky shader, procedural textures
  world/             city builder, per-city looks, landmarks
  track/             circuit layouts + sampled racing line
  car/               procedural car model, vehicle physics, AI driver
  race/Race.js       race session: countdown, laps, collisions, camera
  fx/Particles.js    sparks / smoke / embers
  audio/Audio.js     WebAudio-synthesised engine and effects
  ui/UI.js           menus, car wheel, HUD, leaderboard, minimap, results
dev/                 debug pages (car preview, city fly-through)
```
