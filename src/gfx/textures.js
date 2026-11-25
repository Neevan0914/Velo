import * as THREE from 'three';

// Seeded RNG so cities look the same every time they are built.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// ---------------------------------------------------------------------------
// Road
// ---------------------------------------------------------------------------
/** Asphalt albedo with lane markings. u = across road, v = along (1 tile = 18 m). */
export function roadTexture() {
  return cached('road', () => {
    const W = 1024, H = 1024;
    const [c, g] = canvas(W, H);
    const r = rng(7);
    g.fillStyle = '#2a2b2f';
    g.fillRect(0, 0, W, H);
    // aggregate speckle
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 34 + (r() < 0.02 ? 30 : 0);
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n + 2;
    }
    g.putImageData(img, 0, 0);
    // patches / repairs
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '10,10,12' : '60,60,64'},${0.06 + r() * 0.1})`;
      const x = r() * W, y = r() * H;
      g.fillRect(x, y, 60 + r() * 220, 40 + r() * 260);
    }
    // tyre-darkened racing grooves
    for (const u of [0.2, 0.32, 0.45, 0.57, 0.7, 0.82]) {
      const grad = g.createLinearGradient((u - 0.05) * W, 0, (u + 0.05) * W, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.16)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect((u - 0.05) * W, 0, 0.1 * W, H);
    }
    // cracks
    g.strokeStyle = 'rgba(8,8,10,0.5)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      let x = r() * W, y = r() * H;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    // edge lines
    g.fillStyle = '#e9e9e4';
    g.fillRect(0.035 * W, 0, 0.018 * W, H);
    g.fillRect((1 - 0.053) * W, 0, 0.018 * W, H);
    // dashed lane lines
    for (const u of [0.25, 0.5, 0.75]) {
      for (let k = 0; k < 3; k++) {
        g.fillRect((u - 0.006) * W, (k / 3) * H, 0.012 * W, H / 6);
      }
    }
    // paint wear
    const img2 = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img2.data.length; i += 4) {
      if (img2.data[i] > 150 && r() < 0.25) {
        img2.data[i] -= 70; img2.data[i + 1] -= 70; img2.data[i + 2] -= 70;
      }
    }
    g.putImageData(img2, 0, 0);
    return tex(c, { aniso: 16 });
  });
}

/** Roughness map: smooth wet patches reflect city lights. */
export function roadRoughness() {
  return cached('roadRough', () => {
    const S = 512;
    const [c, g] = canvas(S);
    const r = rng(11);
    g.fillStyle = 'rgb(150,150,150)';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      const x = r() * S, y = r() * S, rad = 20 + r() * 90;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(60,60,60,0.55)');
      grad.addColorStop(1, 'rgba(60,60,60,0)');
      g.fillStyle = grad;
      // wrap so the tile is seamless
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
      }
    }
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 40;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  });
}

/** Tangent-space normal map generated from value noise. */
export function noiseNormal(seed = 3, S = 256, strength = 2.0, scale = 1) {
  return cached(`nrm${seed}_${S}_${strength}_${scale}`, () => {
    const [c, g] = canvas(S);
    const r = rng(seed);
    const h = new Float32Array(S * S);
    // sum of a few wrapped octaves of value noise
    for (let o = 0; o < 4; o++) {
      const cells = 8 * scale * (1 << o);
      const grid = new Float32Array(cells * cells).map(() => r());
      const amp = 1 / (1 << o);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const fx = (x / S) * cells, fy = (y / S) * cells;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = fx - ix, ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = grid[(iy % cells) * cells + (ix % cells)];
        const b = grid[(iy % cells) * cells + ((ix + 1) % cells)];
        const cc = grid[((iy + 1) % cells) * cells + (ix % cells)];
        const d = grid[((iy + 1) % cells) * cells + ((ix + 1) % cells)];
        h[y * S + x] += amp * (a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy);
      }
    }
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x - 1 + S) % S)], rr = h[y * S + ((x + 1) % S)];
      const u = h[((y - 1 + S) % S) * S + x], d = h[((y + 1) % S) * S + x];
      let nx = (l - rr) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  });
}

export function curbTexture() {
  return cached('curb', () => {
    const [c, g] = canvas(64, 256);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#f2f2f2' : '#d4141c';
      g.fillRect(0, i * 64, 64, 64);
    }
    return tex(c);
  });
}

export function checkerTexture() {
  return cached('checker', () => {
    const [c, g] = canvas(256, 64);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
    return tex(c);
  });
}

export function sidewalkTexture() {
  return cached('sidewalk', () => {
    const S = 256;
    const [c, g] = canvas(S);
    const r = rng(21);
    g.fillStyle = '#5d5d60';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 80 + r() * 20;
      g.fillStyle = `rgb(${v},${v},${v + 3})`;
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
    return tex(c);
  });
}

export function wallTexture(accent = '#ff3da8') {
  return cached('wall' + accent, () => {
    const [c, g] = canvas(512, 64);
    const r = rng(5);
    g.fillStyle = '#8b8c90';
    g.fillRect(0, 0, 512, 64);
    const img = g.getImageData(0, 0, 512, 64);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 26;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // advertising blocks with stripes
    g.fillStyle = '#1c1d22';
    g.fillRect(0, 10, 512, 38);
    g.font = 'bold 26px Arial Black, Arial, sans-serif';
    g.textBaseline = 'middle';
    const words = ['VELO', 'NITRO X', 'APEX FUEL', 'GRAND PRIX', 'TURBOCHARGE'];
    let x = 10;
    words.forEach((w, i) => {
      g.fillStyle = i % 2 ? accent : '#ffffff';
      g.fillText(w, x, 30);
      x += g.measureText(w).width + 28;
    });
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 56, 512, 8);
    return tex(c);
  });
}

export function fenceTexture() {
  return cached('fence', () => {
    const S = 128;
    const [c, g] = canvas(S);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(200,205,215,1)';
    g.lineWidth = 3;
    for (let i = -S; i < S * 2; i += 22) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
      g.beginPath(); g.moveTo(i + S, 0); g.lineTo(i, S); g.stroke();
    }
    g.fillStyle = 'rgba(190,195,205,1)';
    g.fillRect(0, 0, S, 5);
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
/**
 * Facade texture. Returns {map, emissive}. One tile = 4 floors x 4 bays.
 * style: office | residential | haussmann | brick | glass
 */
export function facadeTextures(style, palette, seed = 1, litChance = 0.55) {
  return cached(`facade_${style}_${palette.join()}_${seed}_${litChance}`, () => {
    const S = 512;
    const [c, g] = canvas(S);
    const [ce, ge] = canvas(S);
    const r = rng(seed);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, S, S);
    const cols = style === 'haussmann' ? 4 : 8, rows = style === 'haussmann' ? 4 : 8;
    const cw = S / cols, rh = S / rows;

    const wall = {
      office: '#3a3f4a', residential: '#6b625a', haussmann: '#d8ccb4', brick: '#6e3b2c', glass: '#1d2a3a',
    }[style];
    g.fillStyle = wall;
    g.fillRect(0, 0, S, S);
    // wall grain
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * (style === 'brick' ? 30 : 14);
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    if (style === 'brick') {
      g.strokeStyle = 'rgba(30,18,14,0.5)';
      g.lineWidth = 1;
      for (let y = 0; y < S; y += 8) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
        for (let x = (y / 8) % 2 ? 0 : 8; x < S; x += 16) {
          g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke();
        }
      }
    }
    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        let x, y, w, h;
        if (style === 'glass') {
          x = cx * cw + 2; y = ry * rh + 3; w = cw - 4; h = rh - 5;
        } else if (style === 'haussmann') {
          x = cx * cw + cw * 0.28; y = ry * rh + rh * 0.18; w = cw * 0.44; h = rh * 0.66;
        } else if (style === 'office') {
          x = cx * cw + cw * 0.08; y = ry * rh + rh * 0.2; w = cw * 0.84; h = rh * 0.6;
        } else {
          x = cx * cw + cw * 0.22; y = ry * rh + rh * 0.22; w = cw * 0.56; h = rh * 0.56;
        }
        const lit = r() < litChance;
        const col = palette[Math.floor(r() * palette.length)];
        // albedo: dark glass with slight sky reflection
        const gg = g.createLinearGradient(x, y, x + w, y + h);
        gg.addColorStop(0, '#2a3a4e');
        gg.addColorStop(1, '#0c1118');
        g.fillStyle = gg;
        g.fillRect(x, y, w, h);
        if (lit) {
          const k = 0.12 + Math.pow(r(), 1.8) * 0.88;
          ge.globalAlpha = k;
          ge.fillStyle = col;
          ge.fillRect(x, y, w, h);
          // blinds / interior variation
          ge.globalAlpha = 0.35 * r();
          ge.fillStyle = '#000';
          ge.fillRect(x, y, w, h * r() * 0.5);
          ge.globalAlpha = 1;
          g.fillStyle = col;
          g.globalAlpha = 0.35;
          g.fillRect(x, y, w, h);
          g.globalAlpha = 1;
        }
        if (style === 'haussmann') {
          // wrought-iron balcony rail
          g.fillStyle = '#2b2b2e';
          g.fillRect(x - 6, y + h - 4, w + 12, 4);
          g.fillRect(x - 6, y + h - 14, w + 12, 2);
        }
        if (style === 'office' || style === 'glass') {
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(x, y, w, 2);
        }
      }
      if (style === 'haussmann' && ry % 2 === 0) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(0, ry * rh, S, 6);
      }
    }
    const map = tex(c);
    const emissive = tex(ce);
    return { map, emissive };
  });
}

/** Neon sign texture with glow. */
export function neonSignTexture(text, color = '#ff3da8', bg = 'rgba(0,0,0,0.85)', w = 512, h = 128) {
  return cached(`neon_${text}_${color}_${w}_${h}`, () => {
    const [c, g] = canvas(w, h);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.strokeRect(8, 8, w - 16, h - 16);
    let size = h * 0.55;
    g.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    while (g.measureText(text).width > w * 0.86 && size > 10) {
      size -= 2;
      g.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowBlur = 24;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
    g.shadowBlur = 4;
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.65;
    g.fillText(text, w / 2, h / 2 + 2);
    return tex(c, { repeat: false });
  });
}

export function glowTexture() {
  return cached('glow', () => {
    const S = 128;
    const [c, g] = canvas(S);
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return tex(c, { repeat: false });
  });
}

/** Elongated cone of light used for headlight beams on the road. */
export function beamTexture() {
  return cached('beam', () => {
    const W = 128, H = 256;
    const [c, g] = canvas(W, H);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = y / H; // 0 at car, 1 far
      const u = (x / W - 0.5) * 2;
      const spread = 0.15 + v * 0.85;
      const lateral = Math.max(0, 1 - Math.abs(u) / spread);
      const a = Math.pow(lateral, 1.6) * Math.pow(1 - v, 1.3) * Math.min(1, v * 8);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { repeat: false });
  });
}

export function carbonTexture() {
  return cached('carbon', () => {
    const S = 64;
    const [c, g] = canvas(S);
    g.fillStyle = '#0d0d0f';
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) {
      const odd = ((x + y) / 8) % 2;
      const grad = odd ? g.createLinearGradient(x, y, x + 8, y) : g.createLinearGradient(x, y, x, y + 8);
      grad.addColorStop(0, '#1b1c20');
      grad.addColorStop(0.5, '#34363d');
      grad.addColorStop(1, '#141417');
      g.fillStyle = grad;
      g.fillRect(x + 0.5, y + 0.5, 7, 7);
    }
    const t = tex(c);
    t.repeat.set(6, 6);
    return t;
  });
}

export function tyreTexture() {
  return cached('tyre', () => {
    const [c, g] = canvas(256, 32);
    g.fillStyle = '#151516';
    g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#0a0a0a';
    for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 3, 32);
    g.fillStyle = '#202022';
    g.fillRect(0, 14, 256, 4);
    return tex(c);
  });
}

export function clockTexture() {
  return cached('clock', () => {
    const S = 256;
    const [c, g] = canvas(S);
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.fillStyle = '#ffe9b0';
    g.beginPath(); g.arc(0, 0, S * 0.45, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2a10';
    g.lineWidth = 5;
    g.beginPath(); g.arc(0, 0, S * 0.45, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      g.save(); g.rotate((i / 12) * Math.PI * 2);
      g.fillStyle = '#2a1d08';
      g.fillRect(-3, -S * 0.42, 6, 18);
      g.restore();
    }
    g.lineCap = 'round';
    g.strokeStyle = '#1a1206';
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(S * 0.18, -S * 0.2); g.stroke();
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-S * 0.05, -S * 0.36); g.stroke();
    return tex(c, { repeat: false });
  });
}

export function bannerTexture(title, sub, accent) {
  return cached(`banner_${title}_${sub}_${accent}`, () => {
    const [c, g] = canvas(1024, 128);
    const grad = g.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#0b0b12');
    grad.addColorStop(0.5, '#1a1a28');
    grad.addColorStop(1, '#0b0b12');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = accent;
    g.fillRect(0, 0, 1024, 6);
    g.fillRect(0, 122, 1024, 6);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = accent;
    g.shadowBlur = 20;
    g.font = '900 64px "Arial Black", Arial, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(title, 512, 56);
    g.shadowBlur = 0;
    g.font = 'bold 22px Arial, sans-serif';
    g.fillStyle = accent;
    g.fillText(sub, 512, 104);
    return tex(c, { repeat: false });
  });
}

export function groundTexture(tint = '#1d1e22') {
  return cached('ground' + tint, () => {
    const S = 512;
    const [c, g] = canvas(S);
    const r = rng(33);
    g.fillStyle = tint;
    g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 18;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i <= S; i += 128) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
    }
    return tex(c);
  });
}

/** Thumbnail SVG path for a track (for map cards). */
export function trackSvgPath(track, size = 100, pad = 8) {
  const b = track.bounds();
  const sx = (size - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const ox = (size - (b.maxX - b.minX) * sx) / 2, oz = (size - (b.maxZ - b.minZ) * sx) / 2;
  let d = '';
  for (let i = 0; i < track.n; i += 6) {
    const x = (track.px[i] - b.minX) * sx + ox;
    const y = (track.pz[i] - b.minZ) * sx + oz;
    d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d + 'Z';
}
