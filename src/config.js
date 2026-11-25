// ---------------------------------------------------------------------------
// Gameplay tuning
// ---------------------------------------------------------------------------
// Physics runs at a fixed 60 ticks per second. Acceleration values are in
// km/h gained per physics tick, so 0.75 => 45 km/h every real second.
// (Applied literally per real second, 0.75 km/h/s would need ~4.5 minutes to
// reach top speed, so the spec value is applied per tick.)
export const PHYSICS = {
  TICK: 1 / 60,
  BASE_ACCEL: 0.75,           // km/h per tick
  BOOSTED_ACCEL: 1.0,         // Acceleration booster
  VELOCITY_BONUS: 15,         // Velocity booster: +15 km/h to base top speed
  NITRO_COOLDOWN: 15,         // seconds
  NITRO_BOOSTER_REDUCTION: 5, // Nitro booster: cooldown 15s -> 10s
  NITRO_DURATION: 3,          // seconds of burn
  NITRO_SPEED_BONUS: 65,      // km/h above top speed while burning
  NITRO_EXTRA_ACCEL: 1.1,     // extra km/h per tick while burning
  BRAKE: 2.4,                 // km/h per tick
  REVERSE_ACCEL: 0.45,
  REVERSE_MAX: 45,
  COAST: 0.16,
  HANDBRAKE: 0.5,
  LAPS: 3,
};

export const BOOSTS = {
  nitro: {
    key: 'nitro',
    name: 'NITRO',
    tag: '−5s nitro cooldown',
    desc: 'Nitro recharges in 10s instead of 15s.',
    icon: 'M13 2 4 14h6l-1 8 9-12h-6z',
  },
  accel: {
    key: 'accel',
    name: 'ACCELERATION',
    tag: '1.0 km/h/s accel',
    desc: 'Base acceleration rises from 0.75 to 1.0.',
    icon: 'M4 18h3l4-8 3 5 2-3 4 6M4 6h6',
  },
  velocity: {
    key: 'velocity',
    name: 'VELOCITY',
    tag: '+15 km/h top speed',
    desc: 'Raises your base top speed by 15 km/h.',
    icon: 'M3 15a9 9 0 0 1 18 0M12 15l5-5M7 19h10',
  },
};

// ---------------------------------------------------------------------------
// Cars — every brand and model here is fictional.
// ---------------------------------------------------------------------------
// style: hyper | super | gt | muscle   (procedural body archetype)
export const CARS = [
  {
    id: 'raijin', brand: 'KYRIN', model: 'Raijin', style: 'hyper',
    paint: '#e8f0ff', accent: '#00d9ff', rim: '#1a1c22', caliper: '#00d9ff',
    wing: 'big', rimStyle: 'blade', topSpeed: 224, handling: 1.02, underglow: '#00d9ff',
  },
  {
    id: 'lumen', brand: 'ARCADIA', model: 'Lumen GT', style: 'gt',
    paint: '#c4161c', accent: '#ffd36b', rim: '#c9ccd2', caliper: '#ffcc00',
    wing: 'lip', rimStyle: 'five', topSpeed: 220, handling: 1.0,
  },
  {
    id: 'glaive', brand: 'VANTOR', model: 'Glaive', style: 'hyper',
    paint: '#ff6a00', accent: '#111111', rim: '#111214', caliper: '#ff6a00',
    wing: 'big', rimStyle: 'mesh', topSpeed: 226, handling: 0.96, carbon: true,
  },
  {
    id: 'seraph', brand: 'SOLENNE', model: 'Seraph', style: 'super',
    paint: '#f4f1ea', accent: '#c9a45c', rim: '#d9c08a', caliper: '#202020',
    wing: 'duck', rimStyle: 'multi', topSpeed: 218, handling: 1.06, pearl: true,
  },
  {
    id: 'nocturne', brand: 'DRAVEN', model: 'Nocturne', style: 'gt',
    paint: '#141417', accent: '#ff1e3c', rim: '#121212', caliper: '#ff1e3c',
    wing: 'lip', rimStyle: 'five', topSpeed: 222, handling: 0.98, matte: true, underglow: '#ff1e3c',
  },
  {
    id: 'helix', brand: 'ORBIS', model: 'Helix', style: 'super',
    paint: '#1452ff', accent: '#ffffff', rim: '#c9ccd2', caliper: '#ffffff',
    wing: 'duck', rimStyle: 'blade', topSpeed: 221, handling: 1.03,
  },
  {
    id: 'squall', brand: 'HALVEX', model: 'Squall', style: 'muscle',
    paint: '#ffc400', accent: '#141414', rim: '#141414', caliper: '#d01818',
    wing: 'lip', rimStyle: 'five', topSpeed: 225, handling: 0.93, stripes: true,
  },
  {
    id: 'umbra', brand: 'NYXEN', model: 'Umbra', style: 'super',
    paint: '#6c2bd9', accent: '#ff3df2', rim: '#191919', caliper: '#ff3df2',
    wing: 'big', rimStyle: 'mesh', topSpeed: 219, handling: 1.05, iridescent: true, underglow: '#ff3df2',
  },
  {
    id: 'arcs', brand: 'ZENTRA', model: 'Arc-S', style: 'muscle',
    paint: '#1f7a4a', accent: '#e8e8e8', rim: '#bfc3c9', caliper: '#e8e8e8',
    wing: 'duck', rimStyle: 'multi', topSpeed: 223, handling: 0.95, stripes: true,
  },
  {
    id: 'corvid', brand: 'STRIX', model: 'Corvid', style: 'hyper',
    paint: '#2a2e36', accent: '#b6ff00', rim: '#0f0f10', caliper: '#b6ff00',
    wing: 'big', rimStyle: 'blade', topSpeed: 225, handling: 1.0, carbon: true, underglow: '#b6ff00',
  },
];

export const BOT_NAMES = ['R. KANE', 'M. SOLIS', 'A. VOSS', 'J. TANAKA', 'L. MOREAU', 'D. KARIM', 'S. OKAFOR', 'E. NOVAK'];

// ---------------------------------------------------------------------------
// Cities (used both as menu themes and as race maps)
// ---------------------------------------------------------------------------
export const CITIES = {
  vegas: {
    key: 'vegas', name: 'LAS VEGAS', subtitle: 'Neon Strip Night', accent: '#ff3da8',
    swatch: ['#1a0533', '#7d1f8c', '#ff7a3d'],
  },
  newyork: {
    key: 'newyork', name: 'NEW YORK', subtitle: 'Midtown Blue Hour', accent: '#4fb3ff',
    swatch: ['#06132b', '#1d3d73', '#e88b4a'],
  },
  paris: {
    key: 'paris', name: 'PARIS', subtitle: 'Golden Hour Boulevards', accent: '#ffb347',
    swatch: ['#2b2a5e', '#c3608a', '#ffb45e'],
  },
  london: {
    key: 'london', name: 'LONDON', subtitle: 'Foggy Thames Dusk', accent: '#9fd1ff',
    swatch: ['#1b2130', '#495468', '#b9907a'],
  },
  singapore: {
    key: 'singapore', name: 'SINGAPORE', subtitle: 'Marina Bay Lights', accent: '#3dffcf',
    swatch: ['#030d1f', '#103a5c', '#d0408f'],
  },
};
export const CITY_ORDER = ['vegas', 'newyork', 'paris', 'london', 'singapore'];
