// Fully synthesised audio (no asset files): engine, nitro, impacts, UI blips.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('velo.muted') === '1'; } catch { /* ignore */ }
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // engine: two detuned saws + square sub through a resonant lowpass
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 6;
    this.engFilter.frequency.value = 800;
    this.engFilter.connect(this.engGain).connect(this.master);
    this.oscs = [];
    for (const [type, mul, g] of [['sawtooth', 1, 0.35], ['sawtooth', 1.007, 0.3], ['square', 0.5, 0.25]]) {
      const o = ctx.createOscillator();
      o.type = type;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.engFilter);
      o.start();
      this.oscs.push({ o, mul });
    }
    // wind / road noise
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    n.connect(this.windFilter).connect(this.windGain).connect(this.master);
    n.start();
    // tyre screech
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 2200;
    this.skidFilter.Q.value = 8;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    s.connect(this.skidFilter).connect(this.skidGain).connect(this.master);
    s.start();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('velo.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  /** speed km/h, throttle 0..1 */
  engine(speed, throttle, nitro, skid, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // fake 6-speed gearbox
    const gears = [0, 45, 85, 125, 165, 210, 999];
    let g = 1;
    while (g < 6 && speed > gears[g]) g++;
    const lo = gears[g - 1], hi = Math.min(gears[g], 260);
    const rpm = 0.25 + 0.75 * Math.min(1, (speed - lo) / Math.max(1, hi - lo));
    const base = 38 + rpm * 95 + (g - 1) * 6 + (nitro ? 18 : 0);
    for (const { o, mul } of this.oscs) o.frequency.setTargetAtTime(base * mul, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(500 + rpm * 1800 * (0.5 + throttle * 0.6) + (nitro ? 900 : 0), t, 0.05);
    this.engGain.gain.setTargetAtTime(active ? 0.16 + throttle * 0.12 : 0, t, 0.1);
    this.windGain.gain.setTargetAtTime(active ? Math.min(0.2, speed / 1400) : 0, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 4, t, 0.2);
    this.skidGain.gain.setTargetAtTime(active ? Math.min(0.12, skid * 0.25) : 0, t, 0.05);
  }

  idle() { this.engine(0, 0, false, 0, false); }

  beep(freq = 880, dur = 0.18, vol = 0.3, type = 'square') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  whoosh(vol = 0.5, dur = 1.2, f0 = 300, f1 = 3000) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  thud(vol = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
    this.whoosh(vol * 0.5, 0.25, 1500, 600);
  }

  click() { this.beep(1400, 0.05, 0.12, 'triangle'); }
  hover() { this.beep(2200, 0.03, 0.05, 'sine'); }
}
