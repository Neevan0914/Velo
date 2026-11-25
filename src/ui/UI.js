import { CARS, CITIES, CITY_ORDER, BOOSTS, PHYSICS } from '../config.js';
import { TrackPath } from '../track/TrackPath.js';
import { LAYOUTS } from '../track/layouts.js';
import { trackSvgPath } from '../gfx/textures.js';

const $ = (id) => document.getElementById(id);
const WHEEL_R = 760;
const WHEEL_STEP = 12.5; // degrees between cards

export function fmtTime(t) {
  if (!isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
const ordinal = (n) => n + (['TH', 'ST', 'ND', 'RD'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'TH');

export class UI {
  constructor(game) {
    this.g = game;
    this.screens = ['loading', 'menu', 'select', 'hud', 'pause', 'results'];
    this.buildThemePanel();
    this.buildBoosts();
    this.buildMaps();
    this.wireButtons();
    this.lbCache = '';
  }

  show(...names) {
    for (const s of this.screens) $(s).classList.toggle('show', names.includes(s));
  }

  setAccent(c) { document.documentElement.style.setProperty('--accent', c); }

  loading(p, text) {
    $('loadFill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('loadText').textContent = text;
  }

  // ---------------------------------------------------------------- menu
  buildThemePanel() {
    const panel = $('themePanel');
    panel.innerHTML = '';
    for (const key of CITY_ORDER) {
      const c = CITIES[key];
      const b = document.createElement('button');
      b.className = 'theme-opt';
      b.dataset.key = key;
      b.dataset.sfx = '';
      b.style.setProperty('--c', c.accent);
      b.innerHTML = `<span class="sw" style="background:linear-gradient(160deg,${c.swatch.join(',')})"></span><span><b>${c.name}</b><small>${c.subtitle}</small></span>`;
      b.onclick = () => { this.g.setTheme(key); panel.classList.remove('open'); };
      panel.appendChild(b);
    }
  }

  refreshMenu() {
    const s = this.g.sel;
    const c = CITIES[s.theme];
    $('themeName').textContent = c.name;
    $('themeSub').textContent = c.subtitle;
    $('themeSwatch').style.background = `linear-gradient(160deg,${c.swatch.join(',')})`;
    document.querySelectorAll('.theme-opt').forEach((b) => b.classList.toggle('active', b.dataset.key === s.theme));
    const car = CARS.find((x) => x.id === s.car);
    $('menuCarBrand').textContent = car.brand;
    $('menuCarModel').textContent = car.model;
    $('menuStats').innerHTML = this.statsHTML(car, null);
    $('muteBtn').classList.toggle('off', this.g.audio.muted);
  }

  statsHTML(car, boost) {
    const top = car.topSpeed + (boost === 'velocity' ? PHYSICS.VELOCITY_BONUS : 0);
    const acc = boost === 'accel' ? PHYSICS.BOOSTED_ACCEL : PHYSICS.BASE_ACCEL;
    const cd = PHYSICS.NITRO_COOLDOWN - (boost === 'nitro' ? PHYSICS.NITRO_BOOSTER_REDUCTION : 0);
    const row = (l, pct, v) => `<div class="stat"><span>${l}</span><span class="bar"><i style="width:${Math.round(pct * 100)}%"></i></span><span class="v">${v}</span></div>`;
    return [
      row('TOP SPEED', (top - 180) / 70, top),
      row('ACCEL', acc / 1.1, acc.toFixed(2)),
      row('HANDLING', (car.handling - 0.8) / 0.3, Math.round(car.handling * 100)),
      row('NITRO CD', (16 - cd) / 8, cd + 's'),
    ].join('');
  }

  // ---------------------------------------------------------------- select
  buildBoosts() {
    const list = $('boostList');
    list.innerHTML = '';
    for (const b of Object.values(BOOSTS)) {
      const el = document.createElement('button');
      el.className = 'boost';
      el.dataset.key = b.key;
      el.dataset.sfx = '';
      el.innerHTML = `<svg viewBox="0 0 24 24"><path d="${b.icon}"/></svg><b>${b.name}</b><small>${b.tag}</small>`;
      el.title = b.desc;
      el.onclick = () => { this.g.sel.boost = b.key; this.g.saveSel(); this.refreshSelect(); };
      list.appendChild(el);
    }
  }

  buildMaps() {
    const list = $('mapList');
    list.innerHTML = '';
    for (const key of CITY_ORDER) {
      const c = CITIES[key];
      const path = trackSvgPath(new TrackPath(LAYOUTS[key], 4), 100, 10);
      const el = document.createElement('button');
      el.className = 'map';
      el.dataset.key = key;
      el.dataset.sfx = '';
      el.style.setProperty('--c', c.accent);
      el.innerHTML = `<svg viewBox="0 0 100 100" style="background:linear-gradient(160deg,${c.swatch.join(',')})"><path d="${path}"/></svg><b>${c.name}</b><small>${c.subtitle}</small>`;
      el.onclick = () => { this.g.sel.map = key; this.g.saveSel(); this.refreshSelect(); };
      list.appendChild(el);
    }
  }

  buildWheel(thumbs) {
    const wheel = $('wheel');
    wheel.innerHTML = '';
    this.cards = CARS.map((car, i) => {
      const el = document.createElement('button');
      el.className = 'wcard';
      el.dataset.sfx = '';
      el.innerHTML = `<img alt="" src="${thumbs[car.id] || ''}"><div class="nm"><small>${car.brand}</small>${car.model}</div>`;
      el.onclick = () => this.g.selectCar(i);
      wheel.appendChild(el);
      return el;
    });
    const wrap = document.querySelector('.wheel-wrap');
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this._wheelLock) return;
      this._wheelLock = true;
      setTimeout(() => (this._wheelLock = false), 140);
      this.g.selectCar(this.g.carIndex() + (e.deltaY > 0 || e.deltaX > 0 ? 1 : -1));
    }, { passive: false });
    // drag to spin
    let dragX = null, acc = 0;
    wrap.addEventListener('pointerdown', (e) => { dragX = e.clientX; acc = 0; });
    window.addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      acc += e.clientX - dragX;
      dragX = e.clientX;
      if (Math.abs(acc) > 110) { this.g.selectCar(this.g.carIndex() + (acc < 0 ? 1 : -1)); acc = 0; }
    });
    window.addEventListener('pointerup', () => (dragX = null));
  }

  layoutWheel() {
    const cur = this.g.carIndex();
    const n = CARS.length;
    this.cards.forEach((el, i) => {
      let d = i - cur;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      const a = d * WHEEL_STEP;
      el.style.transform = `rotate(${a}deg) translateY(${-WHEEL_R}px) scale(${d === 0 ? 1.12 : 0.92})`;
      el.style.opacity = Math.abs(d) > 4 ? 0 : 1 - Math.abs(d) * 0.12;
      el.style.zIndex = 10 - Math.abs(d);
      el.classList.toggle('active', d === 0);
    });
  }

  refreshSelect() {
    const s = this.g.sel;
    const car = CARS.find((x) => x.id === s.car);
    $('selCarBrand').textContent = car.brand;
    $('selCarModel').textContent = car.model;
    $('selStats').innerHTML = this.statsHTML(car, s.boost);
    document.querySelectorAll('.boost').forEach((b) => b.classList.toggle('active', b.dataset.key === s.boost));
    document.querySelectorAll('.map').forEach((b) => b.classList.toggle('active', b.dataset.key === s.map));
    if (this.cards) this.layoutWheel();
  }

  // ---------------------------------------------------------------- buttons
  wireButtons() {
    const g = this.g;
    $('themeBtn').onclick = () => $('themePanel').classList.toggle('open');
    $('playBtn').onclick = () => g.goSelect();
    $('backBtn').onclick = () => g.goMenu();
    $('raceBtn').onclick = () => g.startRace();
    $('wheelPrev').onclick = () => g.selectCar(g.carIndex() - 1);
    $('wheelNext').onclick = () => g.selectCar(g.carIndex() + 1);
    $('muteBtn').onclick = () => { g.audio.setMuted(!g.audio.muted); this.refreshMenu(); };
    $('resumeBtn').onclick = () => g.resume();
    $('restartBtn').onclick = () => g.startRace();
    $('quitBtn').onclick = () => g.goMenu();
    $('againBtn').onclick = () => g.startRace();
    $('garageBtn').onclick = () => g.goSelect();
    $('menuBtn').onclick = () => g.goMenu();
    document.querySelectorAll('.q').forEach((b) => {
      b.onclick = () => { g.setQuality(b.dataset.q); this.refreshQuality(); };
    });
    this.refreshQuality();
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-sfx]')) { g.audio.ensure(); g.audio.click(); }
    });
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-sfx]');
      if (t && t !== this._hov) { this._hov = t; g.audio.hover(); }
    });
  }

  refreshQuality() {
    document.querySelectorAll('.q').forEach((b) => b.classList.toggle('active', b.dataset.q === this.g.quality));
  }

  // ---------------------------------------------------------------- HUD
  hudSetup(race) {
    const t = race.track;
    this.mm = { ctx: $('minimap').getContext('2d'), b: t.bounds() };
    const b = this.mm.b;
    const size = 220, pad = 22;
    this.mm.scale = (size - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    this.mm.ox = size / 2 - b.cx * this.mm.scale;
    this.mm.oz = size / 2 - b.cz * this.mm.scale;
    const p = new Path2D();
    for (let i = 0; i <= t.n; i += 4) {
      const k = t.wrap(i);
      const x = t.px[k] * this.mm.scale + this.mm.ox, y = t.pz[k] * this.mm.scale + this.mm.oz;
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
    this.mm.path = p;
    $('boostBadge').textContent = BOOSTS[race.player.boost].name;
    $('lapNum').nextElementSibling.textContent = '/' + PHYSICS.LAPS;
    this.lbCache = '';
    $('hudHint').style.opacity = 1;
    setTimeout(() => ($('hudHint').style.opacity = 0), 7000);
    this.countdown('');
    this.message('');
  }

  hud(race, dt) {
    const p = race.player;
    const sp = Math.abs(Math.round(p.speed));
    $('speedNum').textContent = sp;
    const arc = $('gaugeArc');
    if (!this.arcLen) { this.arcLen = arc.getTotalLength(); arc.style.strokeDasharray = this.arcLen; }
    arc.style.strokeDashoffset = this.arcLen * (1 - Math.min(1, sp / 300));
    const gears = [0, 45, 85, 125, 165, 210];
    let g = 1;
    while (g < 6 && sp > gears[g]) g++;
    $('gearNum').textContent = p.speed < -1 ? 'R' : sp < 1 ? 'N' : g;

    const lap = Math.max(1, Math.min(PHYSICS.LAPS, p.lap + 1));
    $('lapNum').textContent = lap;
    $('raceTime').textContent = fmtTime(race.time);
    $('bestLap').textContent = fmtTime(p.bestLap);

    const n = document.querySelector('.nitro');
    let fill, state;
    if (p.nitroActive) { fill = p.nitroTime / PHYSICS.NITRO_DURATION; state = 'BOOST!'; }
    else if (p.nitroCooldown > 0) { fill = 1 - p.nitroCooldown / p.nitroCooldownMax; state = p.nitroCooldown.toFixed(1) + 's'; }
    else { fill = 1; state = 'READY'; }
    $('nitroFill').style.width = `${fill * 100}%`;
    $('nitroState').textContent = state;
    n.classList.toggle('active', p.nitroActive);
    n.classList.toggle('ready', !p.nitroActive && p.nitroCooldown <= 0);

    // leaderboard (only touch DOM when it changes)
    const order = race.standings();
    const html = order.map((c, i) => {
      let gap = '';
      if (c.finished) gap = fmtTime(c.finishTime).slice(0, -2);
      else if (i === 0) gap = 'LEADER';
      else {
        const lead = order[0];
        const d = (lead.progress - c.progress) * race.track.length;
        gap = '+' + (d / Math.max(20, lead.speedMs || 40)).toFixed(1) + 's';
      }
      return `<div class="lb-row${c === p ? ' me' : ''}${c.finished ? ' done' : ''}"><span class="p">${i + 1}</span><span class="c" style="background:${c.def.paint}"></span><span>${c.name}</span><span class="g">${gap}</span></div>`;
    }).join('');
    if (html !== this.lbCache) { $('leaderboard').innerHTML = html; this.lbCache = html; }

    this.drawMinimap(race);
  }

  drawMinimap(race) {
    const { ctx, path, scale, ox, oz } = this.mm;
    ctx.clearRect(0, 0, 220, 220);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 10;
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.stroke(path);
    const t = race.track;
    const sx = t.px[0] * scale + ox, sz = t.pz[0] * scale + oz;
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 4, sz - 4, 8, 8);
    for (const c of race.cars) {
      if (c === race.player) continue;
      ctx.fillStyle = c.def.paint;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x * scale + ox, c.z * scale + oz, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const p = race.player;
    const px = p.x * scale + ox, pz = p.z * scale + oz;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-p.heading);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#ff3da8';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, 9); ctx.lineTo(6, -6); ctx.lineTo(0, -3); ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  countdown(text, go = false) {
    const el = $('countdown');
    el.classList.remove('pop', 'go');
    void el.offsetWidth;
    el.textContent = text;
    if (text) { el.classList.add('pop'); if (go) el.classList.add('go'); }
  }

  message(text, warn = false) {
    const el = $('centerMsg');
    el.textContent = text;
    el.classList.toggle('show', !!text);
    el.classList.toggle('warn', warn);
  }

  toast(text, ms = 1800) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), ms);
  }

  results(race) {
    const order = race.finalStandings();
    const pos = order.findIndex((r) => r.car === race.player) + 1;
    $('resPlace').textContent = ordinal(pos);
    $('resSub').textContent = pos === 1 ? 'VICTORY' : pos <= 3 ? 'PODIUM FINISH' : 'RACE COMPLETE';
    $('resBody').innerHTML = order.map((r, i) => `<tr class="${r.car === race.player ? 'me' : ''}">
      <td>${i + 1}</td><td>${r.car.name}</td><td class="car">${r.car.def.brand} ${r.car.def.model}</td>
      <td class="t">${r.estimated ? '~' : ''}${fmtTime(r.time)}</td><td class="t">${fmtTime(r.car.bestLap)}</td></tr>`).join('');
  }
}
