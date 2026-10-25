// =====================================================================
//  背景・景色（見た目だけ）
//  空 → 月・雲・コウモリ → 遠くの山 → 街並み → 木 → (ゲームの世界) → 霧・落ち葉・ふちの暗さ
//  画像を置けば差し替わる：bg_mountains / bg_town / bg_trees / streetlamp / deco_pumpkin / cloud / bat / leaf
// =====================================================================
const Scenery = {
  layers: null,

  init() {
    const rng = mulberry32Course(777);
    this.layers = {
      mountains: this.prerender(2560, 260, (c, w, h) => this.paintMountains(c, w, h, rng)),
      town: this.prerender(2700, 320, (c, w, h) => this.paintTown(c, w, h, rng)),
      trees: this.prerender(2400, 340, (c, w, h) => this.paintTrees(c, w, h, rng)),
    };
    this.clouds = Array.from({ length: 7 }, () => ({ x: rng() * 1600, y: 40 + rng() * 220, s: 0.6 + rng() * 0.9, v: 0.1 + rng() * 0.25 }));
    this.leaves = Array.from({ length: 28 }, () => this.newLeaf(rng, true));
    this.rng = rng;
  },

  prerender(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    return c;
  },

  paintMountains(c, w, h, rng) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a1846'); g.addColorStop(1, '#140a24');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, h);
    const p1 = rng() * 6, p2 = rng() * 6;
    for (let x = 0; x <= w; x += 8) {
      const t = (x / w) * Math.PI * 2;
      const y = h * 0.45 - Math.sin(t * 3 + p1) * 50 - Math.sin(t * 7 + p2) * 22 - Math.sin(t * 13) * 8;
      c.lineTo(x, y);
    }
    c.lineTo(w, h); c.fill();
  },

  paintTown(c, w, h, rng) {
    let x = 0;
    while (x < w - 40) {
      const bw = 50 + rng() * 70, bh = 60 + rng() * 170;
      c.fillStyle = '#1c1030';
      c.fillRect(x, h - bh, bw, bh);
      if (rng() < 0.4) { c.beginPath(); c.moveTo(x - 4, h - bh); c.lineTo(x + bw / 2, h - bh - 26); c.lineTo(x + bw + 4, h - bh); c.fill(); }
      if (rng() < 0.3) c.fillRect(x + bw * 0.7, h - bh - 22, 8, 22);
      for (let wy = h - bh + 12; wy < h - 14; wy += 18) {
        for (let wx = x + 8; wx < x + bw - 10; wx += 14) {
          if (rng() < 0.22) { c.fillStyle = rng() < 0.85 ? 'rgba(255,205,120,0.75)' : 'rgba(255,120,60,0.8)'; c.fillRect(wx, wy, 5, 7); }
        }
      }
      x += bw + 6 + rng() * 30;
    }
  },

  paintTrees(c, w, h, rng) {
    c.strokeStyle = '#0f0818'; c.fillStyle = '#0f0818';
    c.lineCap = 'round';
    const branch = (x, y, len, ang, width, depth) => {
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      c.lineWidth = width;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      if (depth <= 0) return;
      const n = 2 + (rng() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) branch(x2, y2, len * (0.6 + rng() * 0.15), ang + (rng() - 0.5) * 1.3, width * 0.65, depth - 1);
    };
    for (let x = 60; x < w - 60; x += 160 + rng() * 260) {
      const s = 0.7 + rng() * 0.6;
      branch(x, h, 70 * s, -Math.PI / 2 + (rng() - 0.5) * 0.2, 12 * s, 5);
    }
    // 地面のふくらみ
    c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) c.lineTo(x, h - 12 - Math.sin(x / 90) * 6);
    c.lineTo(w, h); c.fill();
  },

  newLeaf(rng, anywhere) {
    return { x: rng() * (W + 200), y: anywhere ? rng() * H : -20, v: 0.6 + rng() * 1.2, sway: rng() * 6, r: rng() * 6, c: ['#c4571c', '#8a3a14', '#d98a2a', '#6b2a10'][Math.floor(rng() * 4)] };
  },

  // 横にループする帯を描く
  tile(img, scrollX, factor, y) {
    const w = img.width;
    let off = (scrollX * factor) % w;
    if (off < 0) off += w;
    ctx.drawImage(img, -off, y);
    if (w - off < W) ctx.drawImage(img, w - off, y);
  },

  // 空と遠景（タイトル画面でも使う）
  backdrop(scrollX, camY = 0, hz = 0) {
    if (!this.layers) this.init();
    if (Assets.has('bg_sky') && hz === 0) {
      ctx.drawImage(Assets.img.bg_sky, 0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, mixColor('#0b0820', '#000000', hz));
      g.addColorStop(0.55, mixColor('#2a1640', '#2a0006', hz));
      g.addColorStop(1, mixColor('#5a2450', '#4a0000', hz));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      for (const s of STARS) {
        ctx.globalAlpha = (0.5 + 0.5 * Math.sin(globalTick / 30 + s.tw)) * Math.max(0, 1 - hz * 3);
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      this.moon(hz);
      this.drawClouds(hz);
      if (hz < 0.3) this.bats();
    }
    const vy = -camY * 0.15;
    ctx.globalAlpha = Math.max(0, 1 - hz * 0.8);
    if (Assets.has('bg_mountains')) this.tile(Assets.img.bg_mountains, scrollX, 0.05, 230 + vy);
    else this.tile(this.layers.mountains, scrollX, 0.05, 230 + vy);
    // 遠くのもや
    const fog = ctx.createLinearGradient(0, 330, 0, 470);
    fog.addColorStop(0, 'rgba(90,50,120,0)'); fog.addColorStop(1, hz ? `rgba(80,0,0,${0.3 + hz * 0.4})` : 'rgba(90,50,120,0.35)');
    ctx.fillStyle = fog; ctx.fillRect(0, 330 + vy, W, 160);
    if (hz < 0.35) {
      ctx.globalAlpha = 1 - hz / 0.35;
      if (Assets.has('bg_town')) this.tile(Assets.img.bg_town, scrollX, 0.15, 170 + vy);
      else this.tile(this.layers.town, scrollX, 0.15, 170 + vy);
    }
    ctx.globalAlpha = Math.max(0, 1 - hz * 1.6);
    if (Assets.has('bg_trees')) this.tile(Assets.img.bg_trees, scrollX, 0.4, 230 - camY * 0.4);
    else this.tile(this.layers.trees, scrollX, 0.4, 230 - camY * 0.4);
    ctx.globalAlpha = 1;
  },

  moon(hz) {
    const mx = 1040, my = 120, r = 54;
    const halo = ctx.createRadialGradient(mx, my, r * 0.8, mx, my, r * 3.2);
    halo.addColorStop(0, hz ? `rgba(255,${Math.round(220 - hz * 200)},${Math.round(160 - hz * 160)},0.35)` : 'rgba(255,230,170,0.35)');
    halo.addColorStop(1, 'rgba(255,200,150,0)');
    ctx.fillStyle = halo; ctx.fillRect(mx - r * 4, my - r * 4, r * 8, r * 8);
    if (Horror.moonEye()) { Horror.drawMoonEye(mx, my, r); return; }
    ctx.fillStyle = mixColor('#fff3cf', '#c01010', Math.min(1, hz * 2.2));
    ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,120,90,0.18)';
    for (const [dx, dy, cr] of [[-18, -12, 12], [14, 10, 9], [20, -20, 6], [-8, 22, 7], [-26, 8, 5]]) {
      ctx.beginPath(); ctx.arc(mx + dx, my + dy, cr, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawClouds(hz) {
    for (const cl of this.clouds) {
      const x = ((cl.x + globalTick * cl.v) % 1700) - 200;
      if (Assets.has('cloud')) { ctx.globalAlpha = 0.6; ctx.drawImage(Assets.img.cloud, x - 120 * cl.s, cl.y - 40 * cl.s, 240 * cl.s, 80 * cl.s); ctx.globalAlpha = 1; continue; }
      ctx.fillStyle = hz ? `rgba(30,0,0,${0.35 + hz * 0.3})` : 'rgba(60,40,90,0.35)';
      for (const [dx, dy, rx, ry] of [[0, 0, 90, 22], [-50, 6, 55, 16], [50, 4, 60, 18], [10, -12, 50, 18]]) {
        ctx.beginPath(); ctx.ellipse(x + dx * cl.s, cl.y + dy * cl.s, rx * cl.s, ry * cl.s, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

  bats() {
    // 12秒ごとにコウモリの群れが月の前を横切る
    const t = globalTick % 720;
    if (t > 260) return;
    for (let i = 0; i < 5; i++) {
      const x = 1300 - t * 6 + i * 40 + Math.sin(i * 2.1) * 20;
      const y = 90 + i * 14 + Math.sin(t / 6 + i) * 8;
      const flap = Math.sin(t / 2 + i) * 6;
      if (Assets.has('bat')) { ctx.drawImage(Assets.img.bat, x - 14, y - 8, 28, 16); continue; }
      ctx.fillStyle = '#0a0612';
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - 12, y - 4 - flap); ctx.lineTo(x - 6, y + 1); ctx.lineTo(x - 2, y + 3);
      ctx.lineTo(x + 2, y + 3); ctx.lineTo(x + 6, y + 1); ctx.lineTo(x + 12, y - 4 - flap); ctx.closePath(); ctx.fill();
    }
  },

  // --- ゲームの世界の中（カメラ座標） ---
  worldTrees(x0, x1) {
    for (const t of LEVEL.trees) {
      if (t.x < x0 - 200 || t.x > x1 + 200) continue;
      Assets.draw(ctx, 'tree', t.x, baseY(t.x, 40), 160 * t.s, 220 * t.s, 0, (c, w, h) => drawBareTree(c, w, h, t.seed));
    }
  },

  // 家のまわりの飾り（家の画像がない時だけ）
  houseDeco(hx, gy, i, hz) {
    if (Assets.has('house') || hz > 0) return;
    // 屋根の電飾
    const colors = ['#ff6a2a', '#ffd23a', '#a050ff', '#50e080'];
    for (let k = 0; k < 9; k++) {
      const lx = hx - 100 + k * 25, ly = gy - 126 + Math.abs(k - 4) * 6 + Math.sin(k) * 2;
      const on = (Math.floor(globalTick / 20) + k + i) % 3 !== 0;
      ctx.fillStyle = on ? colors[(k + i) % 4] : '#333';
      ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();
    }
    // 玄関のかぼちゃ
    if (i % 2 === 0) this.pumpkinDeco(hx + 40, gy);
  },

  pumpkinDeco(x, gy) {
    const glow = ctx.createRadialGradient(x, gy - 12, 2, x, gy - 12, 46);
    glow.addColorStop(0, 'rgba(255,150,40,0.45)'); glow.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 50, gy - 60, 100, 70);
    Assets.draw(ctx, 'deco_pumpkin', x, gy, 30, 26, 0, (c, w, h) => { c.save(); c.translate(0, -h / 2); Placeholder.pumpkinHead(c, w / 2); c.restore(); });
  },

  lamps(x0, x1, hz) {
    for (const lx of LEVEL.lamps) {
      if (lx < x0 - 300 || lx > x1 + 300) continue;
      const gy = groundY(lx);
      const lit = Horror.lampBrightness(lx);
      Assets.draw(ctx, 'streetlamp', lx, gy, 40, 220, 0, (c, w, h) => {
        c.fillStyle = '#2a2236'; c.fillRect(-3, -h, 6, h);
        c.fillRect(-3, -h, 26, 5);
        c.fillStyle = lit > 0.1 ? '#fff2c0' : '#444';
        c.beginPath(); c.moveTo(14, -h + 4); c.lineTo(30, -h + 4); c.lineTo(26, -h + 16); c.lineTo(18, -h + 16); c.fill();
      });
      if (lit <= 0.05) continue;
      // 光（円錐＋地面の光だまり）
      const hx = lx + 22, hy = gy - 204;
      ctx.globalCompositeOperation = 'lighter';
      const cone = ctx.createLinearGradient(0, hy, 0, gy);
      const col = hz ? '255,80,60' : '255,220,150';
      cone.addColorStop(0, `rgba(${col},${0.22 * lit})`); cone.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = cone;
      ctx.beginPath(); ctx.moveTo(hx - 6, hy); ctx.lineTo(hx + 6, hy); ctx.lineTo(hx + 90, gy); ctx.lineTo(hx - 90, gy); ctx.fill();
      const pool = ctx.createRadialGradient(hx, gy, 4, hx, gy, 110);
      pool.addColorStop(0, `rgba(${col},${0.25 * lit})`); pool.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(hx, gy, 110, 22, 0, 0, Math.PI * 2); ctx.fill();
      const head = ctx.createRadialGradient(hx, hy + 6, 1, hx, hy + 6, 30);
      head.addColorStop(0, `rgba(${col},${0.6 * lit})`); head.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = head; ctx.fillRect(hx - 30, hy - 24, 60, 60);
      ctx.globalCompositeOperation = 'source-over';
    }
  },

  ground(x0, x1, hz) {
    // 土
    const g = ctx.createLinearGradient(0, CONFIG.GROUND_Y - 150, 0, CONFIG.GROUND_Y + 200);
    g.addColorStop(0, mixColor('#2c2236', '#1a0606', hz)); g.addColorStop(1, mixColor('#120c18', '#050000', hz));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, H + 400);
    for (let x = x0; x <= x1; x += 16) ctx.lineTo(x, groundY(x));
    ctx.lineTo(x1, H + 400);
    ctx.fill();
    // 歩道のふち
    ctx.strokeStyle = mixColor('#6a5a7a', '#5a2020', hz); ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) x === x0 ? ctx.moveTo(x, groundY(x)) : ctx.lineTo(x, groundY(x));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) x === x0 ? ctx.moveTo(x, groundY(x) + 16) : ctx.lineTo(x, groundY(x) + 16);
    ctx.stroke();
    // 道路の白線（点線）
    ctx.fillStyle = hz > 0.5 ? 'rgba(160,40,40,0.35)' : 'rgba(220,220,220,0.18)';
    const start = Math.floor(x0 / 120) * 120;
    for (let x = start; x < x1; x += 120) ctx.fillRect(x, groundY(x) + 70, 60, 4);
    // 草
    if (hz < 0.5) {
      ctx.strokeStyle = 'rgba(60,90,60,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = Math.floor(x0 / 37) * 37; x < x1; x += 37) {
        const k = Math.sin(x * 12.9898) * 43758.5453;
        if (k - Math.floor(k) < 0.5) continue;
        const gy = groundY(x) - 1, sw = Math.sin(globalTick / 40 + x) * 2;
        ctx.moveTo(x, gy); ctx.lineTo(x - 3 + sw, gy - 8);
        ctx.moveTo(x + 3, gy); ctx.lineTo(x + 5 + sw, gy - 10);
      }
      ctx.stroke();
    }
  },

  // --- 画面の手前（スクリーン座標） ---
  foreground(hz) {
    // 地面の霧
    for (let i = 0; i < 4; i++) {
      const x = ((globalTick * (0.3 + i * 0.15) + i * 400) % (W + 600)) - 300;
      const fg = ctx.createRadialGradient(x, 600, 10, x, 600, 360);
      fg.addColorStop(0, hz ? `rgba(70,0,0,${0.15 + hz * 0.2})` : 'rgba(140,110,170,0.12)');
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg; ctx.fillRect(x - 360, 440, 720, 280);
    }
    // 落ち葉（ハードの奥では灰になる）
    for (const lf of this.leaves) {
      lf.y += lf.v; lf.x += Math.sin(globalTick / 30 + lf.sway) * 0.8 - 0.4; lf.r += 0.04;
      if (lf.y > H + 20) Object.assign(lf, this.newLeaf(this.rng, false));
      ctx.save(); ctx.translate(lf.x, lf.y); ctx.rotate(lf.r);
      if (Assets.has('leaf') && hz === 0) ctx.drawImage(Assets.img.leaf, -7, -5, 14, 10);
      else {
        ctx.fillStyle = hz > 0.3 ? 'rgba(120,120,120,0.7)' : lf.c;
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // 画面のふちを暗く
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.45 + hz * 0.45})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  },
};

function mixColor(a, b, t) {
  if (t <= 0) return a;
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * Math.min(1, t));
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

function drawBareTree(c, w, h, seed) {
  const rng = mulberry32Course(seed);
  c.strokeStyle = '#140b1e'; c.lineCap = 'round';
  const branch = (x, y, len, ang, width, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    c.lineWidth = width;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    if (depth <= 0) return;
    for (let i = 0; i < 2 + (rng() < 0.35 ? 1 : 0); i++) branch(x2, y2, len * (0.62 + rng() * 0.12), ang + (rng() - 0.5) * 1.2, width * 0.66, depth - 1);
  };
  branch(0, 0, h * 0.32, -Math.PI / 2, w * 0.09, 5);
}
