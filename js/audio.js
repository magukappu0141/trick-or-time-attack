// =====================================================================
//  サウンド：manifest のファイルがあれば再生、無ければ WebAudio で仮の音を鳴らす
// =====================================================================
const Sound = {
  files: {},
  ctx: null,
  master: null,
  bgmKey: null,
  bgmEl: null,
  bgmTimer: null,
  muted: false,
  silent: false, // ホラー終盤：ジャンプスケア以外の音をすべて消す

  load() {
    const list = Object.entries(window.ASSET_MANIFEST.sounds);
    return Promise.all(list.map(([key, src]) => new Promise((resolve) => {
      const a = new Audio();
      let done = false;
      const finish = (ok) => { if (done) return; done = true; this.files[key] = ok ? a : null; resolve(); };
      a.addEventListener('canplaythrough', () => finish(true), { once: true });
      a.addEventListener('error', () => finish(false), { once: true });
      setTimeout(() => finish(a.readyState >= 2), 3000);
      a.preload = 'auto';
      a.src = src;
    })));
  },

  // ブラウザの自動再生制限のため、最初のキー入力で呼ぶ
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // 最初のキー入力まで鳴らせなかったBGMをここで鳴らす（止めたBGMは鳴らし直さない）
    if (this.bgmKey && !this.bgmEl && !this.bgmTimer && !this.drone && !this.muted && !this.silent) this.playBgm(this.bgmKey, true);
  },

  // 鳴らした音（ファイルの場合）を返すので、途中で止めたい時に使える
  play(key) {
    if (this.muted || this.silent) return null;
    const f = this.files[key];
    if (f) {
      const a = f.cloneNode();
      a.volume = 0.8;
      a.play().catch(() => {});
      return a;
    }
    const r = SYNTH_SE[key];
    if (r && this.ctx) r(this);
  },

  // 増幅して鳴らす（ジャンプスケア用）。gain 倍にして、コンプレッサーで音割れを抑えつつ押し上げる
  playLoud(key, gain = 2.5) {
    if (this.muted) return null;
    const f = this.files[key];
    if (!f || !this.ctx) return this.play(key);
    const a = f.cloneNode();
    try {
      const src = this.ctx.createMediaElementSource(a);
      const g = this.ctx.createGain(); g.gain.value = gain;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -6; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.1;
      src.connect(g); g.connect(comp); comp.connect(this.ctx.destination);
    } catch (_) { a.volume = 1; }
    a.play().catch(() => {});
    return a;
  },

  // BGMを一時的に小さくする
  duck(on) {
    if (this.bgmEl) this.bgmEl.volume = on ? 0.05 : 0.5;
    if (this.master) this.master.gain.value = on ? 0.05 : 0.35;
  },

  tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.3, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = vol;
    s.buffer = buf; s.connect(g); g.connect(this.master);
    s.start(t);
  },

  playBgm(key, force = false) {
    if (this.silent) return;
    if (this.bgmKey === key && !force) return;
    this.stopBgm();
    this.bgmKey = key;
    if (this.muted) return;
    const f = this.files[key];
    if (f) {
      this.bgmEl = f;
      f.loop = true; f.volume = 0.5; f.currentTime = 0;
      f.play().catch(() => {});
      return;
    }
    if (!this.ctx) return;
    if (key === 'bgm_horror') { this.startDrone(); return; }
    // 仮BGM：簡単なステップシーケンサー
    const song = SYNTH_BGM[key];
    if (!song) return;
    let step = 0;
    let next = this.ctx.currentTime + 0.05;
    const stepDur = 60 / song.bpm / 2;
    this.bgmTimer = setInterval(() => {
      while (next < this.ctx.currentTime + 0.2) {
        const n = song.melody[step % song.melody.length];
        const b = song.bass[step % song.bass.length];
        const d = next - this.ctx.currentTime;
        if (n) this.tone(midi(n), stepDur * 0.9, song.wave, 0.08, null, d);
        if (b) this.tone(midi(b), stepDur * 1.8, 'triangle', 0.14, null, d);
        next += stepDur;
        step++;
      }
    }, 50);
  },

  stopBgm() {
    if (this.bgmEl) { this.bgmEl.pause(); this.bgmEl = null; }
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
    if (this.drone) { this.drone.forEach((n) => { try { n.stop(); } catch (_) {} }); this.drone = null; }
    this.bgmKey = null;
  },

  // 無音モード（ホラー終盤〜ゲーム終了）。ジャンプスケアの音だけが鳴る
  setSilent(on) {
    if (on === this.silent) return;
    this.silent = on;
    if (on) this.stopBgm();
  },

  // 仮のホラーBGM：低い持続音がゆっくりうねる
  startDrone() {
    const c = this.ctx, t = c.currentTime;
    const out = c.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.16, t + 4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
    lp.connect(out); out.connect(this.master);
    const nodes = [];
    for (const [f, type] of [[55, 'sawtooth'], [55.6, 'sawtooth'], [77.8, 'triangle'], [110.9, 'sine']]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lp); o.start(); nodes.push(o);
    }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lfoGain = c.createGain(); lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start(); nodes.push(lfo);
    this.drone = nodes;
  },

  toggleMute() {
    this.muted = !this.muted;
    const key = this.bgmKey;
    if (this.muted) { this.stopBgm(); this.bgmKey = key; } else if (key) this.playBgm(key, true);
  },
};

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

const SYNTH_SE = {
  se_step:     (s) => s.tone(180 + Math.random() * 40, 0.05, 'square', 0.12),
  se_stumble:  (s) => s.tone(300, 0.18, 'sawtooth', 0.2, 90),
  se_fall:     (s) => { s.noise(0.25, 0.3); s.tone(200, 0.4, 'square', 0.2, 50); },
  se_jump:     (s) => s.tone(300, 0.15, 'square', 0.15, 700),
  se_candy:    (s) => { s.tone(880, 0.08, 'square', 0.15); s.tone(1320, 0.12, 'square', 0.15, null, 0.07); s.tone(110, 0.3, 'sawtooth', 0.15, 70, 0.15); },
  se_cat:      (s) => s.tone(700, 0.4, 'sawtooth', 0.15, 400),
  se_whistle:  (s) => { s.tone(2800, 0.15, 'sine', 0.3); s.tone(2800, 0.5, 'sine', 0.3, 2600, 0.2); },
  se_talk:     (s) => s.tone(500 + Math.random() * 300, 0.04, 'square', 0.06),
  se_doorbell: (s) => { s.tone(659, 0.6, 'sine', 0.3); s.tone(523, 0.9, 'sine', 0.3, null, 0.45); },
  se_wrong:    (s) => { s.tone(200, 0.2, 'square', 0.2); s.tone(150, 0.35, 'square', 0.2, null, 0.18); },
  se_clear:    (s) => [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.25, 'square', 0.18, null, i * 0.12)),
  se_split:    (s) => s.tone(1200, 0.1, 'sine', 0.2),
  se_select:   (s) => s.tone(660, 0.06, 'square', 0.15),
  se_scream:   (s) => { s.noise(1.0, 0.5); s.tone(1400, 0.9, 'sawtooth', 0.35, 260); s.tone(1900, 0.8, 'square', 0.2, 420); s.tone(90, 0.9, 'sawtooth', 0.3, 40); },
  se_heartbeat:(s) => { s.tone(60, 0.13, 'sine', 0.7, 38); s.tone(52, 0.16, 'sine', 0.55, 32, 0.2); },
  se_static:   (s) => s.noise(0.5, 0.3),
  se_sandstorm:(s) => s.noise(1.2, 0.35),
  se_shout:    (s) => { s.tone(140, 0.5, 'sawtooth', 0.35, 90); s.tone(210, 0.45, 'square', 0.2, 120, 0.05); s.noise(0.3, 0.2); },
  se_purr:     (s) => { for (let i = 0; i < 6; i++) s.tone(70 + (i % 2) * 8, 0.09, 'sawtooth', 0.06, null, i * 0.08); },
  se_splat:    (s) => { s.noise(0.3, 0.5); s.tone(90, 0.35, 'sine', 0.5, 40); s.noise(1.6, 0.07, 0.25); },
  se_whisper:  (s) => { s.noise(1.4, 0.06); s.tone(220, 1.2, 'sine', 0.03, 180); },
  se_glitch:   (s) => { for (let i = 0; i < 6; i++) s.tone(80 + Math.random() * 900, 0.04, 'square', 0.15, null, i * 0.035); },
};

// 0 = 休符。MIDIノート番号
const SYNTH_BGM = {
  bgm_title: {
    bpm: 100, wave: 'triangle',
    melody: [69, 0, 72, 0, 76, 0, 75, 0, 72, 0, 69, 0, 68, 0, 0, 0, 69, 0, 72, 0, 76, 0, 79, 0, 77, 76, 75, 0, 76, 0, 0, 0],
    bass:   [45, 0, 0, 0, 45, 0, 0, 0, 44, 0, 0, 0, 44, 0, 0, 0, 41, 0, 0, 0, 41, 0, 0, 0, 40, 0, 0, 0, 40, 0, 0, 0],
  },
  bgm_game: {
    bpm: 150, wave: 'square',
    melody: [69, 72, 76, 72, 69, 72, 76, 72, 68, 71, 76, 71, 68, 71, 76, 71, 65, 69, 72, 69, 65, 69, 72, 69, 64, 68, 71, 74, 76, 0, 75, 0],
    bass:   [45, 0, 45, 0, 45, 0, 45, 0, 44, 0, 44, 0, 44, 0, 44, 0, 41, 0, 41, 0, 41, 0, 41, 0, 40, 0, 40, 0, 40, 0, 40, 0],
  },
  bgm_result: {
    bpm: 120, wave: 'square',
    melody: [72, 0, 76, 0, 79, 0, 84, 0, 83, 0, 79, 0, 76, 0, 79, 0, 81, 0, 77, 0, 74, 0, 77, 0, 79, 0, 0, 0, 0, 0, 0, 0],
    bass:   [48, 0, 0, 0, 55, 0, 0, 0, 52, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 50, 0, 0, 0, 55, 0, 0, 0, 43, 0, 0, 0],
  },
};
