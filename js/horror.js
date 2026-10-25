// =====================================================================
//  ハードモードのホラー演出（ノーマルと同じ道 → 途中から一直線の道）
//  h = 一直線の道に入ってからの進み具合（0〜1）で、だんだんおかしくなる
//  画像を置けば差し替わる：horror_house / horror_house_friend / horror_friend / horror_follower
//                          horror_face / horror_moon / horror_eye_candy
// =====================================================================
const HARD_CLEARED_KEY = 'trick_or_time_attack_hard_cleared';

// 一度だけ起きるできごと（at = 進み具合）。文字は js/texts.js の HORROR_LINES
const HORROR_EVENTS = [
  { at: 0.02, run: (H) => { Sound.stopBgm(); Sound.play('se_glitch'); H.burst(0.5); } },
  { at: 0.10, run: () => Sound.playBgm('bgm_horror') },
  { at: 0.25, run: () => Sound.play('se_whisper') },
  { at: 0.35, run: (H) => { H.burst(1); Sound.play('se_static'); } },
  { at: 0.45, run: () => Sound.play('se_whisper') },
  { at: 0.50, run: () => Sound.play('se_whisper') },
  { at: 0.58, run: (H) => { H.burst(1); Sound.play('se_glitch'); } },
  { at: 0.66, run: (H) => { H.burst(1); Sound.play('se_static'); } },
  { at: 0.86, run: () => Sound.play('se_whisper') },
  { at: 0.96, run: () => Sound.stopBgm() },
  ...HORROR_LINES.map((l) => ({ at: l.at, run: (H) => H.say(l.text, l) })),
];

// ジャンプスケア動画（manifest の videos.horror_jumpscare）。無ければGIF → それも無ければ仮の顔
const ScareVideo = {
  el: null, ok: false, gain: null,

  load() {
    const src = window.ASSET_MANIFEST.videos && window.ASSET_MANIFEST.videos.horror_jumpscare;
    this.el = document.getElementById('jumpscareVideo');
    if (!src || !this.el) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (done) return; done = true; this.ok = ok; resolve(); };
      this.el.addEventListener('canplaythrough', () => finish(true), { once: true });
      this.el.addEventListener('error', () => finish(false), { once: true });
      setTimeout(() => finish(this.el.readyState >= 3), 4000);
      this.el.src = src;
      this.el.load();
    });
  },

  // 音は BGM・SE の音量設定を通さず、増幅 → 割れるまで歪ませてそのまま出す
  play(gain) {
    const v = this.el;
    if (Sound.ctx && !this.gain) {
      try {
        const src = Sound.ctx.createMediaElementSource(v);
        const g = Sound.ctx.createGain();
        const clip = Sound.ctx.createWaveShaper();
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.max(-1, Math.min(1, x * 1.4)); }
        clip.curve = curve;
        src.connect(g); g.connect(clip); clip.connect(Sound.ctx.destination);
        this.gain = g;
      } catch (_) { /* WebAudio が使えなければ素の音量で鳴らす */ }
    }
    if (this.gain) this.gain.gain.value = gain;
    v.volume = 1;
    v.muted = Sound.muted;
    v.currentTime = 0;
    v.play().catch(() => {});
  },

  stop() { if (this.el) this.el.pause(); },
};

const Horror = {
  st: null,
  hardCleared: (() => { try { return localStorage.getItem(HARD_CLEARED_KEY) === '1'; } catch (_) { return false; } })(),

  reset() {
    if (this.st) this.endJumpscare();
    this.st = { fired: {}, texts: [], glitch: 0, hb: 0, follower: null, js: null, ending: null, late: false };
    Sound.setSilent(false);
  },

  // ホラー終盤（CONFIG.HORROR_SILENT_AT 以降）〜ゲーム終了：音が消えて、出る文字が全部怖くなる
  late() { return !!(this.st && this.st.late); },

  isHardCourse() { return G && LEVEL.horrorStart != null; },

  level() {
    if (!this.isHardCourse() || (scene !== 'play' && scene !== 'result')) return 0;
    return clamp((G.p.x - LEVEL.horrorStart) / (LEVEL.END_X - 40 - LEVEL.horrorStart), 0, 1);
  },

  active() { return this.level() > 0; },

  say(str, o = {}) {
    // 真ん中に出す文字は1つだけ（前のを消す）
    if (o.x == null) this.st.texts = this.st.texts.filter((t) => t.x != null);
    this.st.texts.push({ str, t: 0, dur: o.dur || 180, color: o.color || '#fff', size: o.size || 30, x: o.x, y: o.y });
  },

  burst(power) { this.st.glitch = Math.max(this.st.glitch, power); },

  update() {
    if (!this.st) this.reset();
    const st = this.st;
    st.texts.forEach((t) => t.t++);
    st.texts = st.texts.filter((t) => t.t < t.dur);
    st.glitch = Math.max(0, st.glitch - 0.02);
    this.updateJumpscare();
    const h = this.level();
    if (h <= 0) return;
    if (h >= CONFIG.HORROR_SILENT_AT && !st.late) { st.late = true; Sound.setSilent(true); }

    HORROR_EVENTS.forEach((ev, i) => {
      if (h >= ev.at && !st.fired[i]) { st.fired[i] = true; ev.run(this); }
    });
    if (h > 0.3 && Math.random() < 0.002 + h * 0.006) this.burst(0.3 + Math.random() * 0.6);

    // 心臓の音（だんだん速く）
    if (h > 0.6 && G.state === 'run') {
      if (--st.hb <= 0) { Sound.play('se_heartbeat'); st.hb = Math.max(26, 80 - (h - 0.6) * 140); }
    }

    // うしろの「なにか」：止まると近づいてくる（捕まえたら消える。ジャンプスケアは1回だけ）
    if (h > 0.5 && h < 0.97 && G.state === 'run' && !st.caughtOnce) {
      if (!st.follower) st.follower = { gap: 650 };
      const f = st.follower;
      const moving = Math.abs(G.p.vx) > 2 && !G.p.fallen;
      f.gap = Math.min(650, f.gap + (moving ? 0.8 : -2.4 - h * 2));
      if (f.gap < 30) this.caught();
    }
  },

  caught() {
    const st = this.st, p = G.p;
    this.jumpscare(CONFIG.SANDSTORM_CAUGHT_MS);
    st.caughtOnce = true;
    st.follower = null;
    p.vx = 0; p.omega = 0; // びっくりさせるだけ（転ばせると抜け出せなくなるので）
    this.say(HORROR_TEXT.caught, { color: '#ff0000', size: 52, dur: 120 });
  },

  hint() {
    const f = this.st && this.st.follower;
    if (f && f.gap < 320) return HORROR_TEXT.runAway;
    return '';
  },

  // --- 表示のゆがみ ---
  splitName(name, i) {
    const h = this.level();
    if (h <= 0.2) return name;
    const help = [...HORROR_TEXT.help];
    if (h > 0.58) return help[i % help.length] + (i % help.length === help.length - 1 ? '' : '…');
    return name.replace(/./g, (ch) => (Math.random() < h * 0.25 ? '■□▒░▓？'[Math.floor(Math.random() * 6)] : ch));
  },

  timerText(str) {
    const h = this.level();
    const g = HORROR_TEXT.timerGlitch;
    if (h > 0.58 && Math.random() < 0.06) return g[Math.floor(Math.random() * g.length)];
    return str;
  },

  distanceText(remainM) {
    const h = this.level();
    if (h <= 0.2) return null;
    if (h > 0.92) return HORROR_TEXT.almost;
    if (h < 0.5) return tx(HORROR_TEXT.distance, { km: (remainM / 1000 + (h - 0.2) * 40).toFixed(3) }); // 進むほど遠くなる
    const d = () => Math.floor(Math.random() * 10);
    return tx(HORROR_TEXT.distance, { km: `${d()}.${d()}${d()}${d()}` });
  },

  lampBrightness(lx) {
    if (LEVEL.horrorStart == null || lx < LEVEL.horrorStart) return 1;
    const local = (lx - LEVEL.horrorStart) / (LEVEL.END_X - LEVEL.horrorStart);
    if (local > 0.75) return 0;
    if (Math.random() < local * 0.35) return 0.15;
    return 1 - local * 0.7;
  },

  moonEye() {
    if (scene === 'title' && this.hardCleared) return true;
    return this.level() >= 0.45;
  },

  drawMoonEye(mx, my, r) {
    if (Assets.has('horror_moon')) { ctx.drawImage(Assets.img.horror_moon, mx - r, my - r, r * 2, r * 2); return; }
    const blink = (globalTick % 400) > 392;
    ctx.fillStyle = '#f2e8d8';
    ctx.beginPath(); ctx.ellipse(mx, my, r, blink ? 2 : r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    if (blink) return;
    // 白目の血管
    ctx.strokeStyle = 'rgba(200,0,0,0.5)'; ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(mx + Math.cos(a) * r * 0.95, my + Math.sin(a) * r * 0.55); ctx.lineTo(mx + Math.cos(a + 0.3) * r * 0.5, my + Math.sin(a + 0.3) * r * 0.3); ctx.stroke();
    }
    // 黒目はプレイヤー（タイトルでは選択中のキャラ）を見る
    const tx = scene === 'play' && G ? G.p.x - G.camX : W / 2 + (costumeIdx - 1) * 330;
    const ty = scene === 'play' && G ? G.p.y - G.camY - 50 : 360;
    const a = Math.atan2(ty - my, tx - mx);
    const ix = mx + Math.cos(a) * r * 0.35, iy = my + Math.sin(a) * r * 0.2;
    ctx.fillStyle = '#a00000'; ctx.beginPath(); ctx.arc(ix, iy, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ix, iy, r * 0.14, 0, Math.PI * 2); ctx.fill();
  },

  // --- 世界の中（カメラ座標）：奥 ---
  worldBack(x0, x1) {
    const hs = LEVEL.horrorStart;
    if (hs == null) return;
    const len = LEVEL.END_X - hs;
    // まったく同じ家がずっと繰り返す
    let n = 0;
    for (let hx = hs + len * 0.12; hx < hs + len * 0.5; hx += 1400, n++) {
      if (hx < x0 - 300 || hx > x1 + 300) continue;
      const by = baseY(hx, 200);
      Assets.draw(ctx, 'horror_house', hx, by, 200, 190, 0, drawHorrorHouse);
      // 3軒に1軒、壁に落書き
      if (n % 3 === 1) drawGraffitiText({ font: FONTS.graffiti[n % FONTS.graffiti.length], size: 30, color: '#b00000', rot: -0.08, drip: true, style: 'plain' }, hx + 10, by - 70, 180, 40);
    }
  },

  // 「Got ist tott!!」の落書き（ブロック塀・道路・暗闇に浮かぶ文字）。地面のあとに描く
  graffiti() {
    if (LEVEL._graffiti) return LEVEL._graffiti;
    const hs = LEVEL.horrorStart, end = LEVEL.END_X - 700, len = LEVEL.END_X - hs;
    const rng = mulberry32(4444);
    const colors = ['#8a0000', '#b00000', 'rgba(235,235,225,0.8)', '#5a0000', '#c8c070'];
    const styles = ['plain', 'plain', 'mirror', 'vertical', 'scrawl', 'shaky', 'upside', 'huge'];
    const list = [];
    let i = 0;
    for (let x = hs + 1100; x < end; i++) {
      const local = (x - hs) / len;
      const kind = local > 0.75 && rng() < 0.5 ? 'air' : rng() < 0.62 ? 'wall' : 'road';
      // 繰り返す家（worldBack）の前に塀を建てない：家と家のまん中にずらす
      let gx = x;
      const houseK = Math.round((x - hs - len * 0.12) / 1400);
      const houseX = hs + len * 0.12 + houseK * 1400;
      if (kind === 'wall' && houseK >= 0 && houseX < hs + len * 0.5 + 200 && Math.abs(x - houseX) < 450) gx = houseX + 700;
      list.push({
        x: gx, kind,
        font: FONTS.graffiti[i % FONTS.graffiti.length],
        color: kind === 'air' ? 'rgba(255,255,255,0.5)' : colors[Math.floor(rng() * colors.length)],
        style: (() => { const st = styles[Math.floor(rng() * styles.length)]; return st !== 'vertical' || kind === 'air' ? st : kind === 'wall' ? 'huge' : 'plain'; })(), // 縦書きは宙に浮かぶ字だけ
        size: 26 + rng() * 26,
        rot: (rng() - 0.5) * 0.3,
        w: 260 + rng() * 220, h: 110 + rng() * 70,
        drip: rng() < 0.6,
      });
      x += (1000 + rng() * 1400) * (1 - local * 0.45); // 奥へ行くほど増える
    }
    return (LEVEL._graffiti = list);
  },

  worldGraffiti(x0, x1) {
    if (LEVEL.horrorStart == null || x1 < LEVEL.horrorStart) return;
    for (const g of this.graffiti()) {
      if (g.x < x0 - 300 || g.x > x1 + 300) continue;
      if (g.kind === 'wall') {
        const by = baseY(g.x, g.w);
        drawBlockWall(g.x, by, g.w, g.h);
        drawGraffitiText(g, g.x, by - g.h / 2 + g.size * 0.3, g.w * 0.88, g.h * 0.55);
      } else if (g.kind === 'road') {
        // 道路に書いてある（つぶして寝かせる）
        ctx.save();
        ctx.translate(g.x, groundY(g.x) + 22);
        ctx.scale(1, 0.38);
        drawGraffitiText({ ...g, rot: 0, drip: false, size: g.size * 1.6 }, 0, 0, 560);
        ctx.restore();
      } else {
        // 暗闇にうっすら浮かぶ（ちらつく）
        if (Math.random() < 0.1) continue;
        ctx.globalAlpha = 0.35 + Math.random() * 0.3;
        drawGraffitiText(g, g.x, groundY(g.x) - 230, 600);
        ctx.globalAlpha = 1;
      }
    }
  },

  // --- 世界の中：手前（プレイヤーの直前に描く） ---
  worldFront() {
    const h = this.level();
    if (h <= 0) return;
    const p = G.p;
    // 遠くに立っている「ともだち」。近づいても距離が変わらない
    if (h > 0.25 && h < 0.92 && Math.random() > 0.03) {
      const jump = (globalTick % 300) < 4 ? -260 : 0; // たまに一瞬だけ近くに出る
      const fx = p.x + 700 + jump;
      ctx.globalAlpha = 0.55 + h * 0.4;
      Assets.draw(ctx, 'horror_friend', fx, groundY(fx), 50, 150, 0, drawHorrorFriend);
      ctx.globalAlpha = 1;
    }
    // うしろの「なにか」
    const f = this.st.follower;
    if (f) {
      const bx = p.x - f.gap;
      if (Assets.has('horror_follower')) Assets.draw(ctx, 'horror_follower', bx, groundY(bx), 64, 96, 0);
      else {
        ctx.save();
        ctx.filter = 'brightness(0)';
        drawPlayer({ x: bx, y: groundY(bx), lean: Math.sin(globalTick / 7) * 0.08, phase: globalTick / 4, vy: 0, onGround: true }, G.c, 0.95);
        ctx.restore();
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); ctx.arc(bx - 6, groundY(bx) - 66, 3, 0, Math.PI * 2); ctx.arc(bx + 8, groundY(bx) - 66, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

  drawFriendHouse(x, gy) {
    Assets.draw(ctx, 'horror_house_friend', x, gy, 320, 260, 0, drawHorrorFriendHouse);
  },

  // 暗闇（プレイヤーのまわりだけ見える）。HUDより先に描くので、UIは読める
  darkness() {
    const h = this.level();
    if (h <= 0.75) return;
    const sx = G.p.x - G.camX, sy = G.p.y - G.camY - 40;
    const r = 520 - (h - 0.75) * 1200;
    const g = ctx.createRadialGradient(sx, sy, Math.max(60, r * 0.3), sx, sy, Math.max(160, r));
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },

  // --- 画面全体の上に重ねる ---
  overlay() {
    if (!this.st) return;
    const st = this.st, h = this.level();
    const end = st.ending;

    // 文字
    for (const t of st.texts) {
      const a = Math.min(1, t.t / 20, (t.dur - t.t) / 30);
      ctx.globalAlpha = a;
      const jx = (Math.random() - 0.5) * (h > 0.3 ? 4 : 1), jy = (Math.random() - 0.5) * (h > 0.3 ? 4 : 1);
      ctx.font = `${Math.round(t.size * 1.3)}px ${FONTS.horror}`; // 筆の字は細いので少し大きく
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, (t.x ?? W / 2) + jx, (t.y ?? 330) + jy);
      ctx.globalAlpha = 1;
    }

    // ノイズ・走査線・画面のずれ
    const noise = h > 0 ? 0.03 + h * 0.1 + st.glitch * 0.3 : st.glitch * 0.3;
    if (noise > 0.01) drawStatic(noise);
    if (h > 0.3) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }
    if (st.glitch > 0.05) glitchSlices(st.glitch);

    // エンディング
    if (end) this.renderEnding();
    // ジャンプスケア → 砂嵐（いちばん上）
    this.renderJumpscare();
  },

  // ===== ジャンプスケア（GIF）→ 砂嵐 =====
  jumpscare(sandstormMs) {
    this.endJumpscare();
    const gifFrames = Math.round((CONFIG.JUMPSCARE_MS / 1000) * CONFIG.FPS);
    Sound.duck(true);
    const video = ScareVideo.ok;
    this.st.js = { t: 0, gif: gifFrames, sand: Math.round((sandstormMs / 1000) * CONFIG.FPS), audio: video ? null : Sound.playLoud('se_scream', CONFIG.JUMPSCARE_VOLUME) };
    const el = document.getElementById('jumpscare'), img = el.querySelector('img');
    img.hidden = video;
    ScareVideo.el.hidden = !video;
    if (video) {
      ScareVideo.play(CONFIG.JUMPSCARE_VOLUME);
      el.hidden = false;
    } else if (Assets.has('horror_jumpscare')) {
      // 毎回はじめから再生させるため、URLを変えて読み直す
      img.src = `${window.ASSET_MANIFEST.images.horror_jumpscare}?r=${Date.now()}`;
      el.hidden = false;
    }
  },

  updateJumpscare() {
    const js = this.st.js;
    if (!js) return;
    js.t++;
    if (js.t === js.gif) {
      document.getElementById('jumpscare').hidden = true;
      ScareVideo.stop();
      if (js.audio) js.audio.pause();
      Sound.duck(false);
      js.audio = Sound.play('se_sandstorm');
    }
    if (js.t >= js.gif + js.sand) this.endJumpscare();
  },

  endJumpscare() {
    const el = document.getElementById('jumpscare');
    if (el) el.hidden = true;
    ScareVideo.stop();
    const js = this.st && this.st.js;
    if (js && js.audio) js.audio.pause();
    if (js) Sound.duck(false);
    if (this.st) this.st.js = null;
  },

  renderJumpscare() {
    const js = this.st.js;
    if (!js) return;
    if (js.t < js.gif) {
      if (!ScareVideo.ok && !Assets.has('horror_jumpscare')) drawScareFace(1 - js.t / js.gif, true); // 動画もGIFも無い時の仮
    } else {
      drawSandstorm(js.t - js.gif);
    }
  },

  // ===== エンディング =====
  intercom(ic) {
    if (ic.t === 1) this.st.texts = this.st.texts.filter((t) => t.x != null); // 真ん中の文字がインターホンと重ならないように消す
    if (ic.t === 40) ic.reply = HORROR_TEXT.ic1;
    if (ic.t === 120) { ic.reply = HORROR_TEXT.ic2; Sound.play('se_whisper'); }
    if (ic.t === 200) ic.reply = HORROR_TEXT.ic3;
    if (ic.t === 210 && !ic.listening) startListening(ic);
  },

  startEnding() {
    G.state = 'horrorEnd';
    G.ic.reply = HORROR_TEXT.trick;
    // ジャンプスケアと砂嵐が終わってから文字を出す
    const jsFrames = Math.round(((CONFIG.JUMPSCARE_MS + CONFIG.SANDSTORM_MS) / 1000) * CONFIG.FPS);
    this.st.ending = { t: 0, textAt: 240 + jsFrames + 40 };
  },

  updateEnding() {
    const e = this.st.ending;
    e.t++;
    if (e.t === 80) G.ic.reply = HORROR_TEXT.prank;
    if (e.t === 170) { Sound.stopBgm(); }
    if (e.t === 240) this.jumpscare(CONFIG.SANDSTORM_MS);
    if (e.t === e.textAt + 260) {
      this.hardCleared = true;
      try { localStorage.setItem(HARD_CLEARED_KEY, '1'); } catch (_) {}
      scene = 'result';
    }
  },

  renderEnding() {
    const { t, textAt } = this.st.ending;
    if (t < 170) return;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (t >= textAt) {
      ctx.globalAlpha = Math.min(1, (t - textAt) / 60);
      ctx.font = `56px ${FONTS.horror}`;
      ctx.textAlign = 'center'; ctx.fillStyle = '#c00000';
      ctx.fillText(HORROR_TEXT.end1, W / 2 + (Math.random() - 0.5) * 2, 340);
      ctx.globalAlpha = 1;
    }
    if (t >= textAt + 100) {
      ctx.globalAlpha = Math.min(1, (t - textAt - 100) / 60);
      ctx.font = `24px ${FONTS.kid}`;
      ctx.fillStyle = '#888';
      ctx.fillText(HORROR_TEXT.end2, W / 2, 400);
      ctx.globalAlpha = 1;
    }
    drawStatic(0.08);
  },
};

// 落書きの文字を (x, y) を中心に描く。maxW × maxH に収まるように大きさを合わせる（maxH が無ければ縮めるだけ）
function drawGraffitiText(g, x, y, maxW, maxH = null) {
  const str = HORROR_TEXT.graffiti;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(g.rot || 0);
  ctx.font = `${g.size}px ${g.font}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = g.color;
  const w = ctx.measureText(str).width;
  if (g.style !== 'vertical') {
    const k = maxH ? Math.min(maxW / w, maxH / g.size) : Math.min(1, maxW / w);
    ctx.scale(k, k);
  }
  if (g.style === 'mirror') ctx.scale(-1, 1);
  if (g.style === 'upside') ctx.rotate(Math.PI);
  if (g.style === 'huge') ctx.scale(1.25, 1.6);
  if (g.style === 'vertical') {
    // 1文字ずつ縦に
    const chars = [...str.replace(/ /g, '')];
    const step = maxH ? (maxH * 1.6) / chars.length : g.size * 0.5;
    ctx.font = `${Math.min(g.size * 0.8, step * 1.3)}px ${g.font}`;
    chars.forEach((ch, k) => ctx.fillText(ch, (k % 2) * 4 - 2, (k - chars.length / 2 + 0.8) * step));
  } else if (g.style === 'scrawl') {
    // 何度も重ねて書きなぐる
    for (let k = 0; k < 4; k++) {
      ctx.globalAlpha *= k === 0 ? 1 : 0.8;
      ctx.save(); ctx.translate((k - 1.5) * 6, (k - 1.5) * g.size * 0.55); ctx.rotate((k - 1.5) * 0.04);
      ctx.fillText(str, 0, 0); ctx.restore();
    }
  } else if (g.style === 'shaky') {
    // 1文字ずつ傾いている
    let cx = -w / 2;
    for (const ch of str) {
      const cw = ctx.measureText(ch).width;
      ctx.save(); ctx.translate(cx + cw / 2, Math.sin(cx * 0.7) * g.size * 0.15); ctx.rotate(Math.sin(cx * 1.3) * 0.25);
      ctx.fillText(ch, 0, 0); ctx.restore();
      cx += cw;
    }
  } else {
    ctx.fillText(str, 0, 0);
  }
  // 血がたれる
  if (g.drip && g.style !== 'vertical') {
    for (let k = 0; k < 7; k++) {
      const dx = -w / 2 + ((k * 0.37 + 0.11) % 1) * w, len = 8 + ((k * 53) % 37) + Math.sin(globalTick / 90 + k) * 3;
      ctx.fillRect(dx, 2, 2.5, len);
      ctx.beginPath(); ctx.arc(dx + 1.2, 2 + len, 2.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// 落書きを書く場所：古いブロック塀
function drawBlockWall(x, by, w, h) {
  ctx.fillStyle = '#2b2829';
  ctx.fillRect(x - w / 2, by - h, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
  for (let y = by - h + 24, r = 0; y < by; y += 24, r++) {
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.stroke();
    for (let bx = x - w / 2 + (r % 2 ? 30 : 0); bx < x + w / 2; bx += 60) { ctx.beginPath(); ctx.moveTo(bx, y - 24); ctx.lineTo(bx, y); ctx.stroke(); }
  }
  ctx.fillStyle = '#3a3637'; ctx.fillRect(x - w / 2 - 4, by - h - 8, w + 8, 8); // 笠木
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - w / 2, by - 30, w, 30);   // 下の汚れ
}

// ---------------------------------------------------------------------
//  仮素材（ホラー）
// ---------------------------------------------------------------------
const STATIC_TILES = [];
function drawStatic(alpha) {
  if (!STATIC_TILES.length) {
    for (let k = 0; k < 3; k++) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d'), img = g.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      STATIC_TILES.push(c);
    }
  }
  const tile = STATIC_TILES[Math.floor(Math.random() * 3)];
  const ox = Math.floor(Math.random() * 256), oy = Math.floor(Math.random() * 256);
  ctx.globalAlpha = Math.min(1, alpha);
  for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(tile, x, y);
  ctx.globalAlpha = 1;
}

// 砂嵐（テレビのザーッ）
function drawSandstorm(t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  drawStatic(0.95);
  // 流れる明るい帯
  for (let i = 0; i < 3; i++) {
    const y = ((t * (6 + i * 3) + i * 240) % (H + 120)) - 60;
    ctx.fillStyle = `rgba(255,255,255,${0.06 + i * 0.03})`;
    ctx.fillRect(0, y, W, 24 + i * 18);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  if (Math.random() < 0.15) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H); } // ちらつき
}

// 画面を横に切ってずらす
function glitchSlices(power) {
  const n = 3 + Math.floor(power * 8);
  for (let i = 0; i < n; i++) {
    const y = Math.random() * H, h = 4 + Math.random() * 40, dx = (Math.random() - 0.5) * 120 * power;
    ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = power * 0.35;
  ctx.drawImage(canvas, 8 * power, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(255,0,0,${power * 0.12})`; ctx.fillRect(0, 0, W, H);
}

// びっくり顔（全画面）
function drawScareFace(k, big = false) {
  const shake = 18 * k;
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + (Math.random() - 0.5) * shake, H / 2 + (Math.random() - 0.5) * shake);
  const s = (big ? 1.25 : 1.0) + (1 - k) * 0.25;
  ctx.scale(s, s);
  if (Assets.has('horror_face')) {
    ctx.drawImage(Assets.img.horror_face, -360, -340, 720, 680);
  } else {
    ctx.fillStyle = '#d8d0c8';
    ctx.beginPath(); ctx.ellipse(0, 0, 230, 290, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    for (const ex of [-85, 85]) {
      ctx.beginPath(); ctx.ellipse(ex, -60, 58, 72, ex > 0 ? -0.2 : 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(ex + (Math.random() - 0.5) * 6, -50, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(ex - 4, 0, 8, 120 + Math.random() * 40); // 黒い涙
    }
    ctx.beginPath();
    ctx.moveTo(-150, 110); ctx.quadraticCurveTo(0, 260, 150, 110); ctx.quadraticCurveTo(0, 170, -150, 110); ctx.fill();
    ctx.fillStyle = '#d8d0c8';
    for (let i = -5; i <= 5; i++) ctx.fillRect(i * 24 - 5, 128 + Math.abs(i) * -2, 10, 22);
  }
  ctx.restore();
  ctx.fillStyle = `rgba(255,0,0,${0.15 * k})`; ctx.fillRect(0, 0, W, H);
}

function drawHorrorHouse(c, w, h) {
  c.fillStyle = '#0c0608';
  c.fillRect(-w / 2, -h * 0.7, w, h * 0.7);
  c.beginPath(); c.moveTo(-w / 2 - 12, -h * 0.7); c.lineTo(0, -h); c.lineTo(w / 2 + 12, -h * 0.7); c.fill();
  // 窓が1つだけ赤く、人影が立っている
  c.fillStyle = '#5a0000'; c.fillRect(-w / 2 + 24, -h * 0.55, 34, 30);
  c.fillStyle = '#000';
  c.beginPath(); c.arc(-w / 2 + 41, -h * 0.55 + 12, 6, 0, Math.PI * 2); c.fill();
  c.fillRect(-w / 2 + 35, -h * 0.55 + 17, 12, 13);
  c.fillStyle = '#050203'; c.fillRect(-14, -50, 28, 50);
}

function drawHorrorFriend(c, w, h) {
  c.fillStyle = '#000';
  c.beginPath(); c.ellipse(0, -h * 0.88, w * 0.28, h * 0.11, 0, 0, Math.PI * 2); c.fill();
  c.fillRect(-w * 0.18, -h * 0.8, w * 0.36, h * 0.5);
  c.fillRect(-w * 0.16, -h * 0.32, w * 0.12, h * 0.32);
  c.fillRect(w * 0.04, -h * 0.32, w * 0.12, h * 0.32);
  c.fillRect(-w * 0.32, -h * 0.78, w * 0.1, h * 0.5); // 長すぎる腕
  c.fillRect(w * 0.22, -h * 0.78, w * 0.1, h * 0.5);
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(-5, -h * 0.89, 2.5, 0, Math.PI * 2); c.arc(5, -h * 0.89, 2.5, 0, Math.PI * 2); c.fill();
}

function drawHorrorFriendHouse(c, w, h) {
  c.fillStyle = '#120808';
  c.fillRect(-w / 2, -h * 0.7, w, h * 0.7);
  c.fillStyle = '#1e0a0a';
  c.beginPath(); c.moveTo(-w / 2 - 16, -h * 0.7); c.lineTo(0, -h); c.lineTo(w / 2 + 16, -h * 0.7); c.fill();
  // 板でふさがれた窓
  c.fillStyle = '#0a0404'; c.fillRect(-w / 2 + 24, -h * 0.55, 44, 36); c.fillRect(w / 2 - 68, -h * 0.55, 44, 36);
  c.strokeStyle = '#3a2418'; c.lineWidth = 6;
  for (const wx of [-w / 2 + 24, w / 2 - 68]) { c.beginPath(); c.moveTo(wx - 4, -h * 0.55 + 4); c.lineTo(wx + 48, -h * 0.55 + 32); c.moveTo(wx - 4, -h * 0.55 + 30); c.lineTo(wx + 48, -h * 0.55 + 6); c.stroke(); }
  // 少しだけ開いたドアから赤い光
  c.fillStyle = '#000'; c.fillRect(-30, -90, 60, 90);
  c.fillStyle = 'rgba(200,0,0,0.6)'; c.fillRect(-4, -90, 8, 90);
  c.fillStyle = '#ddd'; c.fillRect(40, -60, 12, 18);
  c.fillStyle = '#a00'; c.font = `22px ${FONTS.kid}`; c.textAlign = 'center';
  c.fillText(HORROR_TEXT.houseSign, 0, -h - 10);
}

function drawEyeCandy(c, w, h) {
  c.fillStyle = '#eee';
  c.beginPath(); c.arc(0, -h / 2, h * 0.42, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(200,0,0,0.7)'; c.lineWidth = 1;
  for (let k = 0; k < 5; k++) { const a = k * 1.3; c.beginPath(); c.moveTo(Math.cos(a) * h * 0.4, -h / 2 + Math.sin(a) * h * 0.4); c.lineTo(Math.cos(a) * h * 0.15, -h / 2 + Math.sin(a) * h * 0.15); c.stroke(); }
  c.fillStyle = '#600'; c.beginPath(); c.arc(Math.sin(globalTick / 20) * 3, -h / 2, h * 0.18, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#000'; c.beginPath(); c.arc(Math.sin(globalTick / 20) * 3, -h / 2, h * 0.08, 0, Math.PI * 2); c.fill();
}
