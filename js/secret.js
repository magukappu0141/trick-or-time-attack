// =====================================================================
//  隠し要素（ゲーム内では一切説明しない）
//  ・黒猫はクリックでなでられる（ハートが出るだけ）
//  ・電柱13本の掲示板のうち1枚（毎回ランダム）がクリックできて、血で書かれたヒントがある
//  ・ハードで「全部の黒猫を3回ずつなでる」→ おばあちゃんの家で k i l l と打つ
//      → おばあちゃんの首が飛ぶ → 分かれ道からホラーの一直線の道になる
//  ・それ以外で kill と打つと、ゲームのプロセスが終了する
// =====================================================================
const Secret = {
  reset() {
    G.typed = '';
    G.hearts = [];
    G.gore = null;
    G.grandmaDead = false;
    G.boardOpen = false;
    G.hintPole = LEVEL.poles ? Math.floor(Math.random() * LEVEL.poles.length) : -1;
  },

  worldMouse() {
    return { x: mouse.x + Math.round(G.camX), y: mouse.y + Math.round(G.camY) };
  },

  hintBoardRect() {
    if (G.hintPole < 0) return null;
    const pole = LEVEL.poles[G.hintPole];
    const gy = groundY(pole.x);
    return { x: pole.x - 24, y: gy - 206, w: 48, h: 66 };
  },

  // true を返したら、ゲームの更新を止める（掲示板を見ている間）
  update() {
    // --- 掲示板 ---
    if (G.boardOpen) {
      if (mouse.clicked || pressed.Escape || pressed.Enter || pressed.Space) G.boardOpen = false;
      for (const k in pressed) delete pressed[k];
      mouse.clicked = false;
      return true;
    }
    const wm = this.worldMouse();
    const r = this.hintBoardRect();
    const overBoard = r && G.state === 'run' && wm.x > r.x && wm.x < r.x + r.w && wm.y > r.y && wm.y < r.y + r.h;
    canvas.style.cursor = overBoard ? 'pointer' : 'default';
    if (overBoard && mouse.clicked) {
      G.boardOpen = true;
      Sound.play('se_whisper');
      mouse.clicked = false;
      return true;
    }

    // --- 黒猫をなでる ---
    if (mouse.clicked && G.state === 'run') {
      for (const cat of G.cats) {
        if (cat.fled) continue;
        const gy = groundY(cat.x);
        if (Math.abs(wm.x - cat.x) < 36 && wm.y > gy - 52 && wm.y < gy + 8) {
          cat.pets = (cat.pets || 0) + 1;
          cat.pause = 50;
          G.hearts.push({ x: cat.x + 10, y: gy - 46, t: 0 });
          Sound.play('se_purr');
          break;
        }
      }
    }
    for (const h of G.hearts) h.t++;
    G.hearts = G.hearts.filter((h) => h.t < 60);

    // --- k i l l ---
    // おばあちゃんの家の近くで打った文字だけ数える
    if ((this.nearGrandma() && !G.grandmaDead) || this.nearGrandpa()) {
      for (const [code, ch] of [['KeyK', 'k'], ['KeyI', 'i'], ['KeyL', 'l']]) if (pressed[code]) G.typed = (G.typed + ch).slice(-8);
    } else G.typed = '';
    if (G.typed.endsWith('kill')) {
      G.typed = '';
      if (this.nearGrandpa()) startCarry();                 // おじいちゃんは強い
      else if (LEVEL.horrorVariant && this.catsReady()) this.killGrandma();
      else this.killGame();
    }

    this.updateGore();
    return false;
  },

  nearGrandma() {
    return (G.state === 'grandma' && G.dialog && G.dialog.who === 'grandma') || ((G.state === 'run' || G.state === 'harvest') && Math.abs(G.p.x - LEVEL.grandma) < 700);
  },

  nearGrandpa() {
    const talking = G.state === 'grandma' && G.dialog && G.dialog.who === 'grandpa';
    return talking || (G.state === 'run' && Math.abs(G.p.x - LEVEL.grandpa) < 700);
  },

  // どれか3匹の黒猫を、3回ずつなでた
  catsReady() {
    const limit = LEVEL.branchX ?? Infinity;
    return G.cats.filter((c) => c.home < limit && (c.pets || 0) >= 3).length >= 3;
  },

  // ===== おばあちゃん =====
  killGrandma() {
    if (G.state === 'grandma') { G.dialog = null; G.state = 'run'; }
    if (G.state === 'harvest') G.state = 'run';
    G.grandmaDone = true;
    G.grandmaDead = true;
    const gx = LEVEL.grandma + 40, gy = groundY(gx);
    G.gore = {
      t: 0, nx: gx, ny: gy - 70,
      head: { x: gx, y: gy - 80, vx: 3.5, vy: -15, rot: 0, vr: 0.35, rest: false },
      drops: [], pools: [],
    };
    Sound.play('se_splat');
    // 分かれ道から先をホラーの道に差し替える（ここまでの道は同じなので、そのまま続く）
    const H = LEVEL.horrorVariant, bx = H.horrorStart;
    G.candies = G.candies.filter((c) => c.x < bx).concat(H.candies.filter((x) => x >= bx).map((x) => ({ x, taken: false })));
    G.cats = G.cats.filter((c) => c.home < bx);
    LEVEL = H;
  },

  updateGore() {
    const g = G.gore;
    if (!g) return;
    g.t++;
    const R = Math.random;
    if (g.t < 150) {
      const n = g.t < 30 ? 6 : 3;
      for (let i = 0; i < n; i++) g.drops.push({ x: g.nx + (R() - 0.5) * 6, y: g.ny, vx: (R() - 0.5) * 5 + (g.t < 20 ? R() * 3 : 0), vy: -6 - R() * 8 * (g.t < 60 ? 1 : 0.6), r: 2 + R() * 2.5 });
    }
    const h = g.head;
    if (!h.rest) {
      h.vy += 0.5; h.x += h.vx; h.y += h.vy; h.rot += h.vr;
      if (g.t < 50 && R() < 0.6) g.drops.push({ x: h.x, y: h.y, vx: h.vx * 0.3, vy: 0, r: 2 });
      const floor = groundY(h.x) - 12;
      if (h.y >= floor) {
        h.y = floor; h.vy *= -0.4; h.vx *= 0.7; h.vr *= 0.6;
        if (Math.abs(h.vy) < 1.2) h.rest = true;
      }
    }
    for (const d of g.drops) {
      d.vy += 0.45; d.x += d.vx; d.y += d.vy;
      if (d.y >= groundY(d.x)) { d.dead = true; if (g.pools.length < 220) g.pools.push({ x: d.x, w: d.r * 3 + R() * 4, h: d.r * 0.8 + 1 }); }
    }
    g.drops = g.drops.filter((d) => !d.dead);
  },

  // ===== ゲームのプロセスが終了する =====
  killGame() {
    Voice.stop();
    hideTyping();
    Horror.endJumpscare();
    Sound.stopBgm();
    Sound.play('se_glitch');
    canvas.style.cursor = 'default';
    scene = 'killed';
    this.killedT = 0;
  },

  updateKilled() {
    this.killedT++;
    const done = TEXT.killed.length * 30 + 30;
    if (this.killedT > done && (pressed.Enter || pressed.Space || pressed.Escape)) toTitle();
  },

  renderKilled() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.font = '22px Menlo, Monaco, "Courier New", monospace';
    ctx.textAlign = 'left';
    const t = this.killedT;
    TEXT.killed.forEach((line, i) => {
      if (t < i * 30) return;
      ctx.fillStyle = line.startsWith('$') ? '#e8e8e8' : '#9a9a9a';
      let s = line;
      if (i === TEXT.killed.length - 1 && Math.floor(t / 30) % 2 === 0) s += '█';
      ctx.fillText(s, 60, 120 + i * 40);
    });
    if (t > TEXT.killed.length * 30 + 30) {
      ctx.fillStyle = '#555'; ctx.font = '14px Menlo, Monaco, monospace';
      ctx.fillText(TEXT.killedBack, 60, H - 60);
    }
  },

  // ===== 描画（ゲームの世界の中） =====
  drawPoles(x0, x1) {
    const poles = LEVEL.poles;
    if (!poles) return;
    // 電線
    ctx.strokeStyle = 'rgba(10,6,16,0.8)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i].x, b = poles[i + 1].x;
      if (b < x0 - 200 || a > x1 + 200) continue;
      for (const dy of [302, 290]) {
        const ya = groundY(a) - dy, yb = groundY(b) - dy;
        ctx.beginPath(); ctx.moveTo(a, ya); ctx.quadraticCurveTo((a + b) / 2, (ya + yb) / 2 + 60, b, yb); ctx.stroke();
      }
    }
    poles.forEach((pole, i) => {
      if (pole.x < x0 - 200 || pole.x > x1 + 200) return;
      const gy = groundY(pole.x);
      Assets.draw(ctx, 'pole', pole.x, gy, 30, 320, 0, drawPolePlaceholder);
      Assets.draw(ctx, 'board', pole.x, gy - 140, 48, 66, 0, (c, w, h) => drawBoardPlaceholder(c, w, h, pole.kind, i === G.hintPole));
    });
  },

  drawWorldFront() {
    for (const h of G.hearts) {
      ctx.globalAlpha = 1 - h.t / 60;
      ctx.fillStyle = '#ff6fa8'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('♥', h.x, h.y - h.t * 0.8);
      ctx.globalAlpha = 1;
    }
    const g = G.gore;
    if (!g) return;
    ctx.fillStyle = '#4a0000';
    for (const p of g.pools) { ctx.beginPath(); ctx.ellipse(p.x, groundY(p.x) + 2, p.w, p.h, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#b00000';
    for (const d of g.drops) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
    const h = g.head;
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(h.rot);
    Assets.draw(ctx, 'grandma_head', 0, 16, 34, 34, 0, drawGrandmaHeadPlaceholder);
    ctx.restore();
  },

  drawDeadGrandma(gx) {
    Assets.draw(ctx, 'grandma_headless', gx, groundY(gx), 54, 90, 0, drawGrandmaHeadlessPlaceholder);
  },

  // 首が飛んだ瞬間の画面の揺れ
  shake() {
    const g = G.gore;
    if (!g || g.t > 24) return [0, 0];
    const k = (24 - g.t) / 24 * 10;
    return [(Math.random() - 0.5) * k, (Math.random() - 0.5) * k];
  },

  // ===== 掲示板のアップ（画面の上） =====
  renderBoard() {
    if (!G.boardOpen) return;
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
    const bw = 640, bh = 560, bx = (W - bw) / 2, by = 70;
    if (Assets.has('board_closeup')) ctx.drawImage(Assets.img.board_closeup, bx, by, bw, bh);
    else {
      const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      g.addColorStop(0, '#d8cfb4'); g.addColorStop(1, '#a89c7c');
      ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
      // 下の、元の貼り紙（うすく）
      ctx.fillStyle = 'rgba(60,50,40,0.18)'; ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('迷い猫', W / 2, by + 110);
      ctx.fillText('さがしています', W / 2, by + 190);
      // テープ
      ctx.fillStyle = 'rgba(240,235,200,0.7)';
      ctx.fillRect(bx - 20, by + 10, 90, 30); ctx.fillRect(bx + bw - 70, by + 10, 90, 30);
    }
    // 血の文字（たれる）
    const rng = mulberry32Course(666);
    ctx.font = `40px ${FONTS.blood}`;
    ctx.textAlign = 'center';
    HORROR_TEXT.boardHint.forEach((line, i) => {
      const y = by + 120 + i * 52;
      ctx.fillStyle = '#6e0000';
      ctx.save(); ctx.translate(W / 2, y); ctx.rotate((rng() - 0.5) * 0.06);
      ctx.fillText(line, 0, 0);
      const w = ctx.measureText(line).width;
      for (let k = 0; k < line.length / 4; k++) {
        const dx = -w / 2 + rng() * w, len = 6 + rng() * 34;
        ctx.fillRect(dx, 4, 2.5, len);
        ctx.beginPath(); ctx.arc(dx + 1.2, 4 + len, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
    text(TEXT.boardClose, W / 2, by + bh + 34, 14, '#888', 'center');
  },
};

// ---------------------------------------------------------------------
//  仮素材
// ---------------------------------------------------------------------
function drawPolePlaceholder(c, w, h) {
  const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#3a3644'); g.addColorStop(0.5, '#6a6676'); g.addColorStop(1, '#2e2a38');
  c.fillStyle = g; c.fillRect(-w / 4, -h, w / 2, h);
  c.fillStyle = '#2a2632';
  for (let y = -h + 60; y < -20; y += 40) c.fillRect(-w / 4, y, w / 2, 2);
  c.fillRect(-36, -h + 14, 72, 6); // 腕木
  c.fillStyle = '#8a8a9a';
  for (const x of [-30, -12, 12, 30]) { c.beginPath(); c.arc(x, -h + 12, 3, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#d0c040'; c.fillRect(-w / 4, -60, w / 2, 14); // 黄色い反射板
  c.fillStyle = '#000'; for (let i = 0; i < 4; i++) c.fillRect(-w / 4 + i * 4, -60, 2, 14);
}

function drawBoardPlaceholder(c, w, h, kind, isHint) {
  c.fillStyle = ['#e8e2cc', '#f0d8b0', '#f2f0e0', '#dfe8d8', '#e0e4f0', '#efe6d0'][kind];
  c.fillRect(-w / 2, -h, w, h);
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.strokeRect(-w / 2, -h, w, h);
  c.fillStyle = kind === 2 ? '#b02020' : '#333';
  c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
  TEXT.posters[kind].split('\n').forEach((l, i) => c.fillText(l, 0, -h + 14 + i * 12));
  if (kind === 0) { c.fillStyle = '#111'; c.beginPath(); c.ellipse(0, -h + 52, 8, 5, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(7, -h + 47, 4, 0, Math.PI * 2); c.fill(); }
  if (isHint) {
    // うっすら血のしみ
    c.fillStyle = 'rgba(110,0,0,0.55)';
    c.beginPath(); c.ellipse(-8, -h + 40, 9, 5, 0.4, 0, Math.PI * 2); c.fill();
    c.fillRect(-12, -h + 40, 2, 16); c.fillRect(-4, -h + 42, 2, 10);
  }
  c.fillStyle = '#888'; c.beginPath(); c.arc(0, -h + 3, 2, 0, Math.PI * 2); c.fill(); // 画びょう
}

function drawGrandmaHeadPlaceholder(c, w, h) {
  c.fillStyle = '#f2d2b0';
  c.beginPath(); c.arc(0, -h / 2, w * 0.45, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ddd';
  c.beginPath(); c.arc(0, -h / 2 - 9, w * 0.38, Math.PI, 0); c.fill();
  c.fillStyle = '#111';
  c.font = 'bold 9px sans-serif'; c.textAlign = 'center';
  c.fillText('× ×', 0, -h / 2 + 2);
  c.fillStyle = '#a00000'; c.fillRect(-w * 0.3, -h / 2 + w * 0.35, w * 0.6, 4);
}

function drawGrandmaHeadlessPlaceholder(c, w, h) {
  c.fillStyle = '#8a5a8a';
  c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 3, -h * 0.65); c.lineTo(w / 3, -h * 0.65); c.lineTo(w / 2, 0); c.fill();
  c.fillStyle = '#7a0000';
  c.beginPath(); c.ellipse(0, -h * 0.66, 9, 4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#b00000'; c.fillRect(-6, -h * 0.66, 4, 30); c.fillRect(4, -h * 0.66, 3, 20);
}
