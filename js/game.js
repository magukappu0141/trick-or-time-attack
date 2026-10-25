// =====================================================================
//  トリック・オア・タイムアタック 本体
// =====================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = CONFIG.WIDTH;
const H = CONFIG.HEIGHT;
const typingInput = document.getElementById('typing');

// ---------------------------------------------------------------------
//  入力
// ---------------------------------------------------------------------
const keys = {};
const pressed = {};
const mouse = { x: -999, y: -999, clicked: false };
const GAME_KEYS = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'F1'];

addEventListener('keydown', (e) => {
  if (document.activeElement === typingInput) {
    if (e.code === 'Escape') typingInput.blur();
    return;
  }
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  Sound.unlock();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
canvas.addEventListener('mousemove', (e) => Object.assign(mouse, toCanvas(e)));
canvas.addEventListener('mousedown', (e) => { Object.assign(mouse, toCanvas(e)); mouse.clicked = true; Sound.unlock(); });

// ---------------------------------------------------------------------
//  ユーティリティ
// ---------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function terrainH(x) {
  const t = LEVEL.terrain;
  for (let i = 0; i < t.length - 1; i++) {
    const [x0, h0] = t[i], [x1, h1] = t[i + 1];
    if (x >= x0 && x <= x1) return h0 + (h1 - h0) * ((x - x0) / (x1 - x0));
  }
  return 0;
}
const groundY = (x) => CONFIG.GROUND_Y - terrainH(x);
// 幅 w の建物を置く高さ：足元でいちばん低い地面に合わせる（坂の高い側は、あとから描く地面に埋まる）
function baseY(x, w) {
  let y = -Infinity;
  for (let k = -2; k <= 2; k++) y = Math.max(y, groundY(x + (k * w) / 4));
  return y + 4;
}
const slopeAt = (x) => (terrainH(x + 2) - terrainH(x - 2)) / 4;
const meters = (px) => px / CONFIG.PX_PER_METER;

// 背景の星・遠景（見た目用なので固定シード）
const bgRng = mulberry32(1031);
const STARS = Array.from({ length: 120 }, () => ({ x: bgRng() * W, y: bgRng() * 380, r: bgRng() * 1.6 + 0.3, tw: bgRng() * 6 }));

// ---------------------------------------------------------------------
//  シーン管理
// ---------------------------------------------------------------------
let scene = 'title';
let costumeIdx = 0;
let courseIdx = 0;
let G = null;

// RTAの記録はカテゴリ（仮装）×コースごと。イージーは前からある記録をそのまま使う
function rtaKey(c, course) { return course.id === 'easy' ? c.category : `${c.category}|${course.id}`; }
function categoryName(c, course) { return `${c.category} ${course.name}`; }
let globalTick = 0;

function toTitle() {
  if (Horror.st) Horror.endJumpscare();
  canvas.style.cursor = 'default';
  Voice.stop();
  hideTyping();
  scene = 'title';
  Sound.setSilent(false);
  Sound.playBgm('bgm_title');
}

function newRun() {
  Voice.stop();
  hideTyping();
  const c = COSTUMES[costumeIdx];
  LEVEL = COURSES[courseIdx];
  const key = rtaKey(c, LEVEL);
  const data = RTA.load(key);
  G = {
    c, data, key,
    rng: mulberry32(CONFIG.RNG_SEED),
    frame: 0, igt: 0, started: false,
    state: 'run',
    p: {
      x: LEVEL.START_X, y: groundY(LEVEL.START_X), vx: 0, vy: 0,
      lean: 0, omega: 0, onGround: true,
      fallen: false, fallFrames: 0, fallDir: 1,
      lastFoot: null, lastStepFrame: -99, lastMoveFrame: -99, phase: 0,
      invert: 0, weight: 0, roll: 0, bonkCd: 0,
    },
    candies: LEVEL.candies.map((x) => ({ x, taken: false })),
    cats: LEVEL.cats.map((x) => ({ home: x, x, dir: 1, fled: false, phase: 0 })),
    grandmaDone: false, grandpaDone: false,
    splitIdx: 0, splitTimes: [], splitGold: [],
    ghostRec: new GhostRecorder(),
    ghost: data.ghost,
    cmpPB: data.pb, // 比較対象（走行中にPBを更新しても比較は前のPBのまま）
    msgs: [],
    camX: 0, camY: 0,
    dialog: null, ic: null, policeT: 0, clearT: 0,
    stats: { falls: 0, stumbles: 0, warps: 0, candies: 0, shouts: 0, skipped: false },
  };
  G.camX = G.p.x - 420;
  scene = 'play';
  Horror.reset();
  Secret.reset();
  Sound.playBgm('bgm_game');
}

function startTimer() {
  G.started = true;
  G.data.attempts++;
  RTA.save(G.key, G.data);
}

// 通知コメント（毎回出す）。チュートリアルのヒントだけは onceHint で1回だけ
function note(key, color, big = false, t = 110, vars = {}) {
  if (Horror.late()) { // ホラー終盤は通知も全部怖いセリフ
    const w = HORROR_TEXT.whispers;
    msg(HORROR_TEXT.msg[key] || w[Math.floor(Math.random() * w.length)], '#ff1a1a', true, t + 40, FONTS.horror);
    return;
  }
  msg(tx(TEXT.msg[key], vars), color, big, t);
}

function msg(text, color = '#fff', big = false, t = 110, font = null) {
  G.msgs.push({ text, color, big, t, max: t, font });
  if (G.msgs.length > 4) G.msgs.shift();
}

// ---------------------------------------------------------------------
//  更新
// ---------------------------------------------------------------------
function update() {
  globalTick++;
  if (pressed.F1) Assets.debugLabels = !Assets.debugLabels;
  if (pressed.KeyM) Sound.toggleMute();
  if (scene === 'title') updateTitle();
  else if (scene === 'play') updatePlay();
  else if (scene === 'howto') updateHowto();
  else if (scene === 'mictest') updateMicTest();
  else if (scene === 'result') updateResult();
  else if (scene === 'killed') Secret.updateKilled();
  for (const k in pressed) delete pressed[k];
  mouse.clicked = false;
}

// 記録リセット（タイトルで X → Y）：全コース・全仮装のPB・ゴースト・試行回数と、目玉の月（ハードクリア）を消す
let resetAsk = false;
function resetRecords() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX) || k === HARD_CLEARED_KEY)
      .forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
  Horror.hardCleared = false;
  HINT_DONE.clear(); hintShowing = null; // チュートリアルのヒントもまた出るように
}

function updateTitle() {
  if (resetAsk) {
    if (pressed.KeyY) { resetRecords(); resetAsk = false; Sound.play('se_wrong'); }
    else if (pressed.KeyN || pressed.Escape || pressed.KeyX) { resetAsk = false; Sound.play('se_select'); }
    return;
  }
  if (pressed.KeyX) { resetAsk = true; Sound.play('se_select'); return; }
  if (pressed.ArrowLeft || pressed.KeyA) { costumeIdx = (costumeIdx + COSTUMES.length - 1) % COSTUMES.length; Sound.play('se_select'); }
  if (pressed.ArrowRight || pressed.KeyD) { costumeIdx = (costumeIdx + 1) % COSTUMES.length; Sound.play('se_select'); }
  if (pressed.ArrowUp || pressed.KeyW) { courseIdx = (courseIdx + COURSES.length - 1) % COURSES.length; Sound.play('se_select'); }
  if (pressed.ArrowDown || pressed.KeyS) { courseIdx = (courseIdx + 1) % COURSES.length; Sound.play('se_select'); }
  if (pressed.Enter || pressed.Space) { Sound.play('se_select'); scene = 'howto'; }
  if (pressed.KeyV) { Sound.play('se_select'); startMicTest(); }
  if (mouse.clicked && mouse.y > 576 && mouse.y < 610) {
    COURSES.forEach((co, i) => { if (Math.abs(mouse.x - (W / 2 + (i - 1) * 230)) < 105) { courseIdx = i; Sound.play('se_select'); } });
  }
  if (mouse.clicked) {
    for (let i = 0; i < COSTUMES.length; i++) {
      const cx = W / 2 + (i - 1) * 330;
      if (Math.abs(mouse.x - cx) < 150 && mouse.y > 230 && mouse.y < 560) {
        if (costumeIdx === i) scene = 'howto'; else { costumeIdx = i; Sound.play('se_select'); }
      }
    }
  }
}

// ---------------------------------------------------------------------
//  マイクテスト（タイトルで V）：発表会の前に会場で調整する用
// ---------------------------------------------------------------------
let micTest = null;

function startMicTest() {
  scene = 'mictest';
  micTest = { result: '', ok: false, t: 0 };
  Sound.stopBgm();
  Voice.start((alts, isFinal) => {
    if (scene !== 'mictest') return;
    const hit = alts.find(isTrickOrTreat);
    const loud = !Voice.hasMic || Voice.recentPeak >= Voice.loudLine;
    if (hit && loud) { micTest.result = `◯ 合格！「${hit}」`; micTest.ok = true; micTest.t = 120; Sound.play('se_clear'); return; }
    if (!isFinal) return;
    micTest.ok = false; micTest.t = 120;
    micTest.result = hit ? `△ 言葉はOK、声量が足りない（↓キーで基準を下げられる）` : `× 「${alts.join(' / ')}」に聞こえた`;
    Voice.levels = [];
    Sound.play('se_wrong');
  }, () => {
    if (scene !== 'mictest') return;
    micTest.result = '◯ 合格！（音声認識の結果なし → 声の大きさと長さで判定）'; micTest.ok = true; micTest.t = 120; Sound.play('se_clear');
  });
}

function updateMicTest() {
  Voice.update();
  if (micTest.t > 0) micTest.t--;
  const step = Voice.threshold < 0.03 ? 0.002 : 0.005;
  if (pressed.ArrowUp) { Voice.threshold = Math.min(0.5, Voice.threshold + step); Voice.saveThreshold(); }
  if (pressed.ArrowDown) { Voice.threshold = Math.max(0.002, Voice.threshold - step); Voice.saveThreshold(); }
  if (pressed.Escape || pressed.Enter || pressed.KeyV) { Voice.stop(); toTitle(); }
}

// 声量メーター（現在の声量・直近の最大・雑音・合格ライン）
function drawVoiceMeter(mx, my, mw) {
  const max = Math.max(Voice.loudLine * 2.5, 0.05);
  const toX = (v) => mx + clamp(v / max, 0, 1) * mw;
  ctx.fillStyle = '#222'; ctx.fillRect(mx, my, mw, 20);
  ctx.fillStyle = 'rgba(150,150,150,0.5)'; ctx.fillRect(mx, my, toX(Voice.noiseFloor) - mx, 20);
  ctx.fillStyle = Voice.level >= Voice.loudLine ? '#5f5' : '#ff8a1c';
  ctx.fillRect(mx, my + 3, toX(Voice.level) - mx, 14);
  ctx.fillStyle = '#ffd700'; ctx.fillRect(toX(Voice.recentPeak) - 1, my - 2, 3, 24);
  ctx.fillStyle = '#fff'; ctx.fillRect(toX(Voice.loudLine) - 2, my - 6, 4, 32);
  text(Voice.hasMic ? 'ここを超えろ →' : '（声量メーターなし）', toX(Voice.loudLine) - 6, my - 10, 12, '#fff', 'right');
}

function renderMicTest() {
  drawSky(globalTick);
  ctx.fillStyle = 'rgba(5,3,12,0.7)'; ctx.fillRect(0, 0, W, H);
  outlined('マイクテスト', W / 2, 80, 40, '#ff8a1c');
  panel(140, 120, W - 280, 470, 0.9);
  text('マイクに向かって「トリックオアトリート！」と叫んでみてください', W / 2, 168, 20, '#fff', 'center', true);
  text(Voice.statusText(), W / 2, 206, 16, Voice.lastError ? '#f88' : '#9c9', 'center');

  drawVoiceMeter(240, 260, 800);
  text(`今 ${Voice.level.toFixed(3)}　直近の最大 ${Voice.recentPeak.toFixed(3)}　雑音 ${Voice.noiseFloor.toFixed(3)}　合格ライン ${Voice.loudLine.toFixed(3)}`, W / 2, 314, 15, '#ccc', 'center');
  text('灰色＝周りの雑音　黄色の線＝直近3秒の最大　白い線＝合格ライン（雑音が大きいと自動で上がる）', W / 2, 340, 13, '#999', 'center');

  text('聞こえた言葉', 200, 396, 15, '#aaa');
  text((Voice.interim || Voice.lastFinal || '（まだ何も聞こえていない）').slice(0, 24), 200, 430, 24, '#fff', 'left', true);
  if (micTest.result) {
    ctx.globalAlpha = micTest.t > 0 ? 1 : 0.6;
    outlined(micTest.result, W / 2, 490, 26, micTest.ok ? '#5f5' : '#ffb060');
    ctx.globalAlpha = 1;
  }
  text('認識エンジンの動き', 900, 396, 13, '#aaa');
  Voice.log.slice(-5).forEach((l, i) => text(l, 900, 418 + i * 18, 12, '#9ab'));
  text(`↑↓: 合格ラインの調整（今 ${Voice.threshold.toFixed(3)}・保存されます）`, W / 2, 545, 16, '#ffe9a0', 'center');
  text('反応しないとき：Chrome で http://localhost を開く／アドレスバーでマイクを許可／OSの設定でブラウザのマイクを許可', W / 2, 572, 13, '#999', 'center');
  outlined('Esc / Enter: もどる', W / 2, 650, 22, '#fff');
}

function updateHowto() {
  if (pressed.Enter || pressed.Space || mouse.clicked) { Sound.play('se_select'); newRun(); }
  else if (pressed.Escape) toTitle();
}

function updateResult() {
  if (pressed.KeyR || pressed.Space) newRun();
  else if (pressed.Enter || pressed.Escape) toTitle();
}

function updatePlay() {
  if (pressed.KeyR) { newRun(); return; }
  // 掲示板を見ている間はゲームを止める（タイマーは進む）
  if (Secret.update()) { if (G.started) { G.frame++; G.igt++; } return; }
  if (scene !== 'play') return; // kill でゲームが終了した
  if (pressed.Escape) { toTitle(); return; }
  const p = G.p;

  if (!G.started && (pressed.KeyA || pressed.KeyD || pressed.Space || keys.ArrowLeft || keys.ArrowRight)) startTimer();
  const timing = G.state !== 'clear' && G.state !== 'horrorEnd';
  if (G.started && timing) {
    G.frame++;
    if (G.state !== 'grandma') G.igt++; // おばあちゃんの話は「ロード扱い」
  }

  const prevX = p.x;
  switch (G.state) {
    case 'run': updateRun(prevX); break;
    case 'grandma': updateGrandma(); break;
    case 'police': updatePolice(); break;
    case 'harvest': updateHarvest(); break;
    case 'carry': updateCarry(); break;
    case 'door': updateDoor(); break;
    case 'intercom': updateIntercom(); break;
    case 'clear': updateClear(); break;
    case 'horrorEnd': Horror.updateEnding(); break;
  }
  updateCats();
  Horror.update();

  for (const m of G.msgs) m.t--;
  G.msgs = G.msgs.filter((m) => m.t > 0);

  const tx = p.x - 420;
  const ty = (groundY(p.x) - CONFIG.GROUND_Y) * 0.8;
  G.camX += (tx - G.camX) * 0.15;
  G.camY += (ty - G.camY) * 0.08;

  if (G.started && timing) G.ghostRec.record(G.frame, p);
}

function playerInput() {
  const inv = G.p.invert > 0;
  let back = !!keys.ArrowLeft, fwd = !!keys.ArrowRight;
  if (inv) [back, fwd] = [fwd, back];
  return {
    L: !!pressed.KeyA, R: !!pressed.KeyD, back, fwd,
    jumpPress: !!pressed.Space, jumpHold: !!keys.Space,
  };
}

function updateRun(prevX) {
  const p = G.p, c = G.c, i = playerInput();
  if ((keys.ShiftLeft || keys.ShiftRight) && (pressed.Enter || pressed.NumpadEnter)) p.vx = Math.min(p.vx + 1.6, 16);
  const slope = slopeAt(p.x);
  const headMass = c.headMass + Math.min(p.weight, CONFIG.CANDY_WEIGHT_MAX) * CONFIG.CANDY_WEIGHT;
  const inPuddle = p.onGround && LEVEL.puddles.some(([a, b]) => p.x > a && p.x < b);
  if (p.invert > 0) p.invert--;
  if (p.bonkCd > 0) p.bonkCd--;
  if (p.boost > 0) p.boost--;
  // おばけは Shift を押している間すり抜ける（柵・黒猫を無視）
  p.phasing = !!c.phase && !p.fallen && !!(keys.ShiftLeft || keys.ShiftRight);

  if (!p.fallen) {
    // --- 歩く：A/Dを交互に ---
    if (p.onGround && (i.L || i.R)) {
      const foot = i.L && i.R ? 'both' : i.L ? 'L' : 'R';
      const interval = G.frame - p.lastStepFrame;
      if (foot === 'both' || foot === p.lastFoot) {
        p.vx *= 0.75; p.omega += CONFIG.STUMBLE_KICK;
        G.stats.stumbles++;
        Sound.play('se_stumble');
        note(foot === 'both' ? 'stumbleBoth' : 'stumbleSame', '#ffb0b0');
      } else if (c.hemLimit && interval < c.hemLimit) {
        p.vx *= 0.8; p.omega += c.hemKick ?? CONFIG.HEM_KICK;
        G.stats.stumbles++;
        Sound.play('se_stumble');
        note('hem', '#ffb0b0');
      } else if (inPuddle && G.rng() < CONFIG.SLIP_CHANCE) {
        p.vx *= 0.8; p.omega += (G.rng() < 0.5 ? -1 : 1) * CONFIG.SLIP_KICK;
        Sound.play('se_stumble');
        note('slip', '#b0d0ff');
      } else {
        const dir = p.invert > 0 ? -1 : 1; // 黒猫の呪い：逆に歩く
        const power = c.stepPower * Math.max(0.3, 1 - Math.min(p.weight, CONFIG.CANDY_WEIGHT_MAX) * 0.03) * (inPuddle ? 0.5 : 1);
        const boost = p.boost > 0;
        const maxV = c.maxSpeed * (boost ? CONFIG.CANDY_BOOST_SPEED : 1);
        if (dir > 0) p.vx += power * (boost ? CONFIG.CANDY_BOOST_POWER : 1) * Math.max(0, 1 - p.vx / maxV);
        else p.vx -= power * Math.max(0, 1 + p.vx / c.maxSpeed);
        p.omega += CONFIG.STEP_LEAN_PUSH * dir;
        p.phase += Math.PI / 2;
        Sound.play('se_step');
      }
      p.lastFoot = foot; p.lastStepFrame = G.frame; p.lastMoveFrame = G.frame;
    }

    // --- バランス（倒立振子） ---
    let alpha = CONFIG.LEAN_GRAVITY * Math.sin(p.lean) * headMass;
    alpha -= CONFIG.LEAN_SPRING * (c.spring || 1) * clamp(p.lean, -CONFIG.LEAN_SPRING_LIMIT, CONFIG.LEAN_SPRING_LIMIT); // 体幹
    if (i.back) alpha -= CONFIG.LEAN_INPUT;
    if (i.fwd) alpha += CONFIG.LEAN_INPUT;
    alpha -= slope * 0.003; // 上り坂は後ろに、下り坂は前に倒れやすい
    p.omega = (p.omega + alpha) * CONFIG.LEAN_DAMPING;
    p.lean += p.omega;
    if (Math.abs(p.lean) > CONFIG.FALL_ANGLE) fall();

    if (i.jumpPress && p.onGround && !p.fallen) {
      p.vy = -c.jumpV; p.onGround = false;
      if (p.invert === 0) p.vx = Math.max(p.vx, CONFIG.JUMP_MIN_VX); // 前に跳ぶ
      Sound.play('se_jump');
    }
  } else {
    // --- 転倒中 ---
    p.fallFrames++;
    p.lean += (p.fallDir * Math.PI / 2 - p.lean) * 0.2;
    if (c.rollWhenFallen && p.onGround) {
      // パンプキンロール：転がると速い（下り坂は特に）
      p.vx = clamp(p.vx + 0.05 * p.fallDir - slope * 0.5, -11, 11);
      p.roll += p.vx / 28;
    } else if (p.onGround) {
      p.vx *= 0.9;
    }
    if (p.fallFrames >= CONFIG.GETUP_MIN_FRAMES &&
        (i.jumpPress || i.L || i.R || (!c.rollWhenFallen && p.fallFrames >= CONFIG.GETUP_AUTO_FRAMES))) {
      getUp();
    }
  }

  // --- 物理 ---
  if (p.onGround) {
    p.vx *= CONFIG.GROUND_FRICTION;
    // 歩くのをやめたらブレーキ（転倒中の転がり・すべりは対象外）。止まっていれば坂でも滑らない
    const idle = !p.fallen && G.frame - p.lastMoveFrame > CONFIG.IDLE_FRAMES;
    if (idle) {
      p.vx *= CONFIG.IDLE_FRICTION;
      if (Math.abs(p.vx) < 0.3) p.vx = 0;
    } else if (!p.fallen) {
      p.vx -= slope * 0.08;
    }
  } else {
    p.vx *= CONFIG.AIR_DRAG;
    p.vy += CONFIG.GRAVITY;
    if (c.glide && i.jumpHold && p.vy > 1.0 && !p.fallen) p.vy = 1.0; // マントで滑空
  }
  p.x += p.vx;
  if (p.x < 40) { p.x = 40; p.vx = 0; }

  collideFences(prevX);

  const gy = groundY(p.x);
  if (p.onGround) {
    p.y = gy;
  } else {
    p.y += p.vy;
    if (p.y >= gy) { p.y = gy; p.vy = 0; p.onGround = true; p.lastMoveFrame = G.frame; }
  }

  collectCandies();
  checkCats();
  checkSignal(prevX);
  checkGrandma(prevX);
  checkGrandpa(prevX);

  while (G.splitIdx < LEVEL.splits.length && LEVEL.splits[G.splitIdx].x != null && p.x >= LEVEL.splits[G.splitIdx].x) split();

  if (p.x >= LEVEL.END_X - 40) {
    p.x = LEVEL.END_X - 40; p.vx = 0;
    if (p.fallen) getUp();
    G.state = 'door';
  }
}

function fall() {
  const p = G.p;
  p.fallen = true; p.fallFrames = 0;
  p.fallDir = Math.sign(p.lean) || 1;
  p.omega = 0;
  G.stats.falls++;
  Sound.play('se_fall');
  const c = G.c;
  if (c.rollWhenFallen) note('fallPumpkin', '#ffcc66');
  else note('fall', '#ffcc66');
}

function getUp() {
  const p = G.p;
  p.fallen = false; p.lean = 0; p.omega = 0; p.roll = 0;
  p.vx *= 0.3; p.lastFoot = null;
}

function collideFences(prevX) {
  const p = G.p;
  if (p.phasing) return;
  for (const fx of LEVEL.fences) {
    const half = CONFIG.FENCE_HALF;
    if (p.x <= fx - half || p.x >= fx + half) continue;
    const top = groundY(fx) - CONFIG.FENCE_H;
    if (p.y > top) {
      // 少し押し戻して止める → その場で Space を押せば越えられる
      p.x = prevX <= fx ? fx - half - CONFIG.FENCE_KNOCKBACK : fx + half + CONFIG.FENCE_KNOCKBACK;
      p.vx = 0;
      if (!p.fallen) p.omega -= 0.03;
      if (p.bonkCd === 0) { Sound.play('se_stumble'); note('fenceBonk', '#ffb0b0'); }
      p.bonkCd = 20;
    }
  }
}

function collectCandies() {
  const p = G.p;
  for (const cd of G.candies) {
    if (cd.taken || Math.abs(p.x - cd.x) > 22) continue;
    if (p.y > groundY(cd.x) - 30) {
      cd.taken = true;
      if (LEVEL.horrorStart != null && cd.x > LEVEL.horrorStart) {
        // ハードの目玉：重くはならない（不気味なだけ）
        Sound.play('se_whisper');
        note('eyeCandy', '#ff3030');
        continue;
      }
      p.weight++; G.stats.candies++;
      p.boost = CONFIG.CANDY_BOOST_FRAMES; // お菓子パワーで少しの間ダッシュ
      p.vx += CONFIG.CANDY_BOOST_KICK;
      Sound.play('se_candy');
      note('candy', '#ff9ad0', false, 110, { percent: Math.round(CONFIG.CANDY_WEIGHT * 100) });
    }
  }
}

function updateCats() {
  for (const cat of G.cats) {
    cat.phase += 0.3;
    if (cat.fled) { cat.x += 7; continue; }
    if (cat.pause > 0) { cat.pause--; continue; } // なでられている
    cat.x += cat.dir * 1.3;
    if (cat.x > cat.home + 140) cat.dir = -1;
    if (cat.x < cat.home - 140) cat.dir = 1;
  }
}

function checkCats() {
  const p = G.p;
  if (p.phasing) return;
  for (const cat of G.cats) {
    if (cat.fled || Math.abs(p.x - cat.x) > 28) continue;
    if (p.y > groundY(cat.x) - 30) {
      cat.fled = true;
      p.invert = CONFIG.INVERT_FRAMES;
      Sound.play('se_cat');
      note('cat', '#c080ff', true, 150);
      note('cat2', '#c080ff', false, 150);
    }
  }
}

function isRed(sig) {
  return (G.frame + sig.offset) % (CONFIG.SIGNAL_RED + CONFIG.SIGNAL_GREEN) < CONFIG.SIGNAL_RED;
}

// 次に色が変わるまでの秒数
function signalRemainSec(sig) {
  const cyc = (G.frame + sig.offset) % (CONFIG.SIGNAL_RED + CONFIG.SIGNAL_GREEN);
  const left = cyc < CONFIG.SIGNAL_RED ? CONFIG.SIGNAL_RED - cyc : CONFIG.SIGNAL_RED + CONFIG.SIGNAL_GREEN - cyc;
  return Math.ceil(left / CONFIG.FPS);
}

// これから向かう（または今いる）一番近い信号
function nextSignal(range = Infinity) {
  return LEVEL.signals.find((s) => s.x - G.p.x > -320 && s.x - G.p.x < range) || null;
}

function checkSignal(prevX) {
  const p = G.p;
  const sig = LEVEL.signals.find((s) => prevX < s.x && p.x >= s.x);
  if (!sig || !isRed(sig)) return;
  if (Math.abs(p.vx) >= CONFIG.POLICE_SPEED_EXEMPT) {
    note('tooFast', '#80ffb0', true);
  } else if (groundY(p.x) - p.y >= CONFIG.POLICE_HEIGHT_EXEMPT) {
    note('tooHigh', '#80ffb0', true);
  } else {
    G.state = 'police'; G.policeT = 0; G.policeSig = sig;
    p.vx = 0;
    G.stats.warps++;
    Sound.play('se_whistle');
    note('police', '#ff6060', true, 120);
  }
}

function updatePolice() {
  const p = G.p;
  G.policeT++;
  p.y = Math.min(groundY(p.x), p.y + 6); p.vy = 0; p.onGround = p.y >= groundY(p.x);
  if (G.policeT === 110) {
    p.x = Math.max(LEVEL.START_X, G.policeSig.x - CONFIG.POLICE_WARP_BACK);
    p.y = groundY(p.x); p.vx = 0; p.vy = 0; p.onGround = true;
    if (p.fallen) getUp();
    p.lean = 0; p.omega = 0;
    G.camX = p.x - 420;
    G.state = 'run';
    note('warped', '#ff9090', true, 110, { m: meters(CONFIG.POLICE_WARP_BACK) });
  }
}

// ---------------------------------------------------------------------
//  おばあちゃん（強制会話・スキップボタンが逃げる）
// ---------------------------------------------------------------------
function checkGrandma(prevX) {
  const p = G.p;
  if (G.grandmaDone || !(prevX < LEVEL.grandma && p.x >= LEVEL.grandma)) return;
  G.grandmaDone = true;
  if (p.fallen && G.c.rollWhenFallen) { startHarvest(); return; }
  if (p.fallen) { note('crawlPast', '#80ffb0', true); return; }
  startTalk('grandma');
}

// おじいちゃん（おばあちゃんと同じ仕組み。口調だけ違う）
function checkGrandpa(prevX) {
  const p = G.p;
  if (G.grandpaDone || !(prevX < LEVEL.grandpa && p.x >= LEVEL.grandpa)) return;
  G.grandpaDone = true;
  if (p.fallen) { note('crawlPastGrandpa', '#80ffb0', true); return; }
  startTalk('grandpa');
}

// 長話を始める（who = 'grandma' / 'grandpa'）
function startTalk(who) {
  const p = G.p;
  G.state = 'grandma';
  p.vx = 0; p.vy = 0;
  const talks = who === 'grandpa' ? GRANDPA_TALKS : GRANDMA_TALKS;
  const talk = talks[Math.floor(Math.random() * talks.length)];
  const lines = talk.map((l) => tx(l, { name: TEXT.grandmaName, costume: G.c.grandmaGuess }));
  G.dialog = {
    who, lines, line: 0, chars: 0, acc: 0, t: 0, wait: 0, elapsed: 0, extra: 0,
    btn: makeSkipBtn(1020, 610, 'スキップ ▶', true),
    decoys: [], decoyed: false,
    ai: { lastMx: mouse.x, lastMy: mouse.y, mvx: 0, mvy: 0, px: mouse.x, py: mouse.y, hist: [], acc: 0.5, speedAvg: 0, dodges: 0, misses: 0 },
    fx: [], trail: [], hitstop: 0, saved: 0, grandmaSay: null,
  };
}

// ---------------------------------------------------------------------
//  かぼちゃが転がってくると、おばあちゃんに頭を採集される
// ---------------------------------------------------------------------
function startHarvest() {
  const p = G.p;
  G.state = 'harvest';
  G.harvest = { t: 0, line: 0, fromX: LEVEL.grandma + 40, headX: p.x, headY: p.y - 34 };
  p.vx = 0;
  Sound.play('se_stumble');
}

function updateHarvest() {
  const p = G.p, h = G.harvest;
  h.t++;
  h.line = Math.min(GRANDMA_HARVEST_LINES.length - 1, Math.floor(h.t / 70));
  if (h.t % 6 === 0 && h.t < 200 && (h.t % 70) < 40) Sound.play('se_talk');
  if (h.t === 70) {
    // 頭を持っていかれる
    G.headless = true;
    G.c = Object.assign({}, G.c, G.c.headless);
    G.stats.headStolen = true;
    p.fallen = false; p.lean = 0; p.omega = 0; p.roll = 0;
    Sound.play('se_candy');
  }
  if (h.t >= 210) {
    G.state = 'run';
    p.lastFoot = null;
    note('headStolen', '#ff9a3c', true, 150);
    note('headStolen2', '#ffe080', false, 150);
  }
}

// ---------------------------------------------------------------------
//  おじいちゃんに kill と打つと、かわされて、担がれてスタートまで戻される
// ---------------------------------------------------------------------
function startCarry() {
  const p = G.p;
  G.dialog = null;
  G.state = 'carry';
  G.carry = { t: 0, gx: p.x + 70 };
  p.vx = 0; p.vy = 0; p.fallen = false; p.omega = 0;
  Sound.play('se_jump');
}

function updateCarry() {
  const p = G.p, c = G.carry;
  c.t++;
  if (c.t < 25) {
    c.gx = p.x + 70 + Math.sin((c.t / 25) * Math.PI) * 90; // ひょいっとかわす
  } else if (c.t === 25) {
    Sound.play('se_stumble'); // つかまれる
  } else if (c.t < 60) {
    c.gx += (p.x - c.gx) * 0.3;
  } else if (c.t === 60) {
    Sound.play('se_shout');
  } else if (c.t < 190) {
    c.gx -= 26; // 担いで走って戻る
  }
  if (c.t >= 25 && c.t < 200) {
    p.x = c.gx; p.y = groundY(p.x) - 92; p.lean = -1.45; // 頭の上で横向き
    p.phase += 0.4;
  }
  if (c.t === 200) {
    p.x = LEVEL.START_X; p.y = groundY(p.x); p.lean = 0; p.vx = 0; p.onGround = true;
    G.camX = p.x - 420;
    G.state = 'run';
    note('carried', '#ff9090', true, 150);
  }
}

// おばあちゃん・おじいちゃんの立ち位置
function grandpaX() {
  if (G.state === 'grandma' && G.dialog.who === 'grandpa') return G.p.x + 70;
  if (G.state === 'carry') return G.carry.gx;
  return LEVEL.grandpa + 40;
}

function grandmaX() {
  const home = LEVEL.grandma + 40;
  if (G.state === 'grandma' && G.dialog.who === 'grandma') return G.p.x + 70;
  if (G.state === 'harvest') {
    const h = G.harvest, near = G.p.x + 50;
    if (h.t < 50) return home + (near - home) * (h.t / 50);
    if (h.t < 150) return near;
    return near + (home - near) * Math.min(1, (h.t - 150) / 50);
  }
  return home;
}

// ---------------------------------------------------------------------
//  スキップボタンAI：カーソルの未来位置を予測して逃げる。スタミナ制。分身もする
// ---------------------------------------------------------------------
const SKIP_AREA = { x: 60, y: 300, w: 1170, h: 390 }; // 会話ウィンドウからはみ出して逃げる
const GRANDMA_HIDE_SPOT = { x: 150, y: 600 }; // おばあちゃんの後ろ

function makeSkipBtn(x, y, label, real) {
  return { x, y, w: 170, h: 48, vx: 0, vy: 0, label, real, stamina: 100, fear: 'calm', exhaustT: 0, hideT: 0, dashCd: 0, say: '', sayT: 0, popT: 0 };
}

function btnSay(b, kind, t = 60) {
  const list = SKIP_SAYINGS[kind];
  b.say = list[Math.floor(Math.random() * list.length)];
  b.sayT = t;
}

// 話している人ごとの文章
const talkComments = (d) => (d.who === 'grandpa' ? GRANDPA_COMMENTS : GRANDMA_COMMENTS);

function grandmaInterrupt(textStr) {
  const d = G.dialog;
  const extras = d.who === 'grandpa' ? GRANDPA_EXTRA_LINES : GRANDMA_EXTRA_LINES;
  if (d.extra < extras.length) {
    d.lines.splice(d.line + 1, 0, extras[d.extra++]);
  }
  d.grandmaSay = { text: textStr, t: 90 };
}

function updateGrandma() {
  const p = G.p, d = G.dialog;
  p.lean *= 0.9; p.omega = 0;
  if (p.fallen) getUp();

  // スキップ成功の演出中（ヒットストップ）
  if (d.hitstop > 0) {
    d.hitstop--;
    updateSkipFx(d);
    if (d.hitstop === 0) endGrandma(true);
    return;
  }

  d.elapsed++; d.t++;
  const line = d.lines[d.line];
  if (d.chars < line.length) {
    // だんだん早口になる
    d.acc += grandmaSpeed(d.line);
    const before = d.chars;
    while (d.acc >= 1 && d.chars < line.length) { d.chars++; d.acc -= 1; }
    if (d.chars > before && d.t % 3 === 0) Sound.play('se_talk');
  } else if (++d.wait > grandmaWait(d.line)) {
    d.line++; d.chars = 0; d.wait = 0; d.acc = 0;
    if (d.line >= d.lines.length) { endGrandma(false); return; }
  }
  if (d.grandmaSay && --d.grandmaSay.t <= 0) d.grandmaSay = null;

  // --- カーソルの動きを観測して未来位置を予測 ---
  const ai = d.ai;
  const mvx = mouse.x - ai.lastMx, mvy = mouse.y - ai.lastMy;
  ai.lastMx = mouse.x; ai.lastMy = mouse.y;
  ai.mvx = ai.mvx * 0.7 + mvx * 0.3;
  ai.mvy = ai.mvy * 0.7 + mvy * 0.3;
  ai.px = mouse.x + ai.mvx * CONFIG.SKIP_PREDICT_FRAMES;
  ai.py = mouse.y + ai.mvy * CONFIG.SKIP_PREDICT_FRAMES;
  ai.hist.push([ai.px, ai.py]);
  if (ai.hist.length > CONFIG.SKIP_PREDICT_FRAMES) {
    // 10フレーム前の予測が当たったか採点（予測精度の表示用）
    const [ox, oy] = ai.hist.shift();
    if (Math.hypot(mvx, mvy) > 1) ai.acc = ai.acc * 0.97 + (Math.hypot(ox - mouse.x, oy - mouse.y) < 60 ? 0.03 : 0);
  }
  ai.speedAvg = ai.speedAvg * 0.95 + Math.hypot(mvx, mvy) * 0.05;
  if (ai.speedAvg > 30 && !ai.commentedSpeed) {
    ai.commentedSpeed = true;
    d.grandmaSay = { text: talkComments(d).mouse, t: 120 };
  }

  // --- 分身の術 ---
  if (!d.decoyed && (d.elapsed > CONFIG.SKIP_DECOY_AFTER || ai.misses >= 2)) {
    d.decoyed = true;
    const b = d.btn;
    ['スキッブ ▶', 'ズキップ ▶'].forEach((label, i) => {
      const dcy = makeSkipBtn(b.x, b.y, label, false);
      dcy.vx = (i ? 1 : -1) * 18; dcy.vy = (i ? -1 : 1) * 8;
      d.decoys.push(dcy);
    });
    btnSay(b, 'decoy', 90);
    Sound.play('se_jump');
  }

  // キーボードでスキップしようとする人へ
  if (pressed.Enter || pressed.Space || pressed.KeyA || pressed.KeyD) btnSay(d.btn, 'keyboard', 90);

  updateSkipBtn(d.btn, d);
  for (const dcy of d.decoys) updateSkipBtn(dcy, d);
  updateSkipFx(d);

  // --- クリック判定 ---
  if (mouse.clicked) {
    const inside = (b) => mouse.x > b.x && mouse.x < b.x + b.w && mouse.y > b.y && mouse.y < b.y + b.h;
    const b = d.btn;
    const decoy = d.decoys.find(inside);
    if (inside(b)) {
      catchSkip(d);
    } else if (decoy) {
      d.decoys.splice(d.decoys.indexOf(decoy), 1);
      skipPop(d, decoy.x + decoy.w / 2, decoy.y + decoy.h / 2, 'ハズレ', '#c080ff');
      Sound.play('se_wrong');
      grandmaInterrupt(talkComments(d).decoy);
    } else if (Math.hypot(mouse.x - (b.x + b.w / 2), mouse.y - (b.y + b.h / 2)) < 130) {
      ai.misses++;
      btnSay(b, 'dodge', 50);
      skipPop(d, mouse.x, mouse.y, 'スカッ', '#aaa');
      if (ai.misses % 2 === 0) grandmaInterrupt(talkComments(d).miss);
    }
  }
}

function updateSkipBtn(b, d) {
  const ai = d.ai, A = SKIP_AREA;
  if (b.sayT > 0) b.sayT--;
  if (b.popT > 0) b.popT--;
  if (b.dashCd > 0) b.dashCd--;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;

  if (b.exhaustT > 0) {
    // 力尽きて寝ている
    b.exhaustT--;
    b.stamina = Math.min(100, b.stamina + 0.35);
    if (b.exhaustT === 0) { b.fear = 'calm'; btnSay(b, 'recover', 50); }
  } else if (b.hideT > 0) {
    // おばあちゃんの後ろに隠れる
    b.hideT--;
    b.vx += (GRANDMA_HIDE_SPOT.x - cx) * 0.02;
    b.vy += (GRANDMA_HIDE_SPOT.y - cy) * 0.02;
  } else {
    // 「今のカーソル」と「予測した未来のカーソル」の近いほうから逃げる
    const dN = Math.hypot(cx - mouse.x, cy - mouse.y) || 1;
    const dP = Math.hypot(cx - ai.px, cy - ai.py) || 1;
    const usePred = dP < dN;
    const tx = usePred ? ai.px : mouse.x, ty = usePred ? ai.py : mouse.y;
    const dist = Math.min(dN, dP);
    const prevFear = b.fear;
    if (dist < CONFIG.SKIP_FLEE_RANGE) {
      const power = (b.real ? 1 : 0.75) * (0.6 + 4.0 * (b.stamina / 100));
      const esc = bestEscape(b, ai);
      b.vx += Math.cos(esc) * power;
      b.vy += Math.sin(esc) * power;
      b.stamina -= power * CONFIG.SKIP_STAMINA_DRAIN * (b.real ? 1 : 0.5);
      b.fear = dist < 110 ? 'panic' : 'alert';
      if (dN < CONFIG.SKIP_DASH_RANGE && b.dashCd === 0 && b.stamina > 12) {
        // 横っ飛び：最善の逃げ道へダッシュ
        const best = bestEscape(b, ai);
        b.vx += Math.cos(best) * CONFIG.SKIP_DASH_POWER; b.vy += Math.sin(best) * CONFIG.SKIP_DASH_POWER;
        b.dashCd = CONFIG.SKIP_DASH_COOLDOWN;
        b.stamina -= CONFIG.SKIP_DASH_COST;
        if (b.real) ai.dodges++;
        if (b.sayT === 0 && Math.random() < 0.4) btnSay(b, 'dodge', 35);
      }
    } else {
      b.stamina = Math.min(100, b.stamina + CONFIG.SKIP_STAMINA_REGEN);
      b.fear = 'calm';
    }
    if (b.fear !== prevFear && b.fear !== 'calm' && b.sayT === 0 && Math.random() < 0.5) btnSay(b, b.fear, 45);
    if (b.real && b.fear === 'panic' && b.stamina > 50 && Math.random() < 0.004) { b.hideT = 80; btnSay(b, 'hide', 80); }
    if (b.stamina < 30 && b.sayT === 0 && Math.random() < 0.01) btnSay(b, 'tired', 60);
    if (b.stamina <= 0) {
      b.stamina = 0;
      b.exhaustT = CONFIG.SKIP_EXHAUST_FRAMES;
      btnSay(b, 'exhausted', CONFIG.SKIP_EXHAUST_FRAMES);
    }
  }

  b.vx *= 0.85; b.vy *= 0.85;
  b.x += b.vx; b.y += b.vy;
  const hitX = b.x < A.x || b.x + b.w > A.x + A.w;
  const hitY = b.y < A.y || b.y + b.h > A.y + A.h;
  b.x = clamp(b.x, A.x, A.x + A.w - b.w);
  b.y = clamp(b.y, A.y, A.y + A.h - b.h);
  if (hitX) b.vx = 0;
  if (hitY) b.vy = 0;
  if ((hitX || hitY) && b.exhaustT === 0 && b.stamina > 25 && Math.hypot(b.x + b.w / 2 - mouse.x, b.y + b.h / 2 - mouse.y) < 90) {
    // 壁に追い詰められたらワープ（スタミナを大きく使う）
    b.x = A.x + Math.random() * (A.w - b.w);
    b.y = A.y + Math.random() * (A.h - b.h);
    b.stamina -= 25;
    btnSay(b, 'warp', 40);
  }
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > 7) d.trail.push({ x: b.x, y: b.y, w: b.w, h: b.h, a: 0.35, real: b.real });
}

// 16方向に「逃げ道」を調べて、いちばん良い方向（角度）を返す。
// 良い方向 = 壁まで遠い・行き先がカーソルから遠い・途中でカーソル（と予測位置）の近くを通らない
function bestEscape(b, ai) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let best = 0, bestScore = -Infinity;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    const len = Math.min(rayRoom(b, dx, dy), 200);
    const ex = cx + dx * len, ey = cy + dy * len;
    const clear = Math.min(segDist(mouse.x, mouse.y, cx, cy, ex, ey), segDist(ai.px, ai.py, cx, cy, ex, ey));
    const score = Math.hypot(ex - mouse.x, ey - mouse.y) + Math.min(clear, 120) * 1.5 + len * 0.5;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best;
}

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

// その方向に壁まで何px逃げられるか
function rayRoom(b, dx, dy) {
  const A = SKIP_AREA;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const tx = dx > 0 ? (A.x + A.w - b.w / 2 - cx) / dx : dx < 0 ? (A.x + b.w / 2 - cx) / dx : Infinity;
  const ty = dy > 0 ? (A.y + A.h - b.h / 2 - cy) / dy : dy < 0 ? (A.y + b.h / 2 - cy) / dy : Infinity;
  return Math.min(300, tx, ty);
}

function skipPop(d, x, y, str, color) {
  d.fx.push({ kind: 'text', x, y, str, color, t: 40 });
}

const grandmaSpeed = (line) => CONFIG.GRANDMA_SPEED_START + line * CONFIG.GRANDMA_SPEED_UP;
const grandmaWait = (line) => Math.max(CONFIG.GRANDMA_LINE_WAIT_MIN, CONFIG.GRANDMA_LINE_WAIT - line * 4);

function catchSkip(d) {
  // 聞かずに済んだ残りのセリフの時間を計算（RTA的なタイムセーブ）
  let frames = (d.lines[d.line].length - d.chars) / grandmaSpeed(d.line) + grandmaWait(d.line);
  for (let i = d.line + 1; i < d.lines.length; i++) frames += d.lines[i].length / grandmaSpeed(i) + grandmaWait(i);
  d.saved = frames;
  d.hitstop = 50;
  const b = d.btn;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const colors = ['#ff8a1c', '#ffd700', '#ff4fa0', '#80ffb0', '#c080ff', '#fff'];
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 12;
    d.fx.push({ kind: 'confetti', x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, rot: Math.random() * 6, color: colors[i % colors.length], t: 50 + Math.random() * 30 });
  }
  btnSay(b, 'caught', 50);
  Sound.play('se_clear');
}

function updateSkipFx(d) {
  for (const f of d.fx) {
    f.t--;
    if (f.kind === 'confetti') { f.x += f.vx; f.y += f.vy; f.vy += 0.4; f.vx *= 0.98; f.rot += 0.2; }
    else f.y -= 0.8;
  }
  d.fx = d.fx.filter((f) => f.t > 0);
  for (const tr of d.trail) tr.a -= 0.05;
  d.trail = d.trail.filter((tr) => tr.a > 0);
}

function endGrandma(skipped) {
  const d = G.dialog;
  G.state = 'run';
  G.dialog = null;
  G.stats.skipped = skipped;
  if (skipped) {
    G.stats.skipSaved = d.saved;
    msg(tx(TEXT.msg.skipOk, { sec: (d.saved / CONFIG.FPS).toFixed(1) }), '#ffe080', true); // 何秒短縮したかは毎回出す（RTAの情報）
  } else {
    note('grandmaDone', '#ffe080', true);
  }
}

// ---------------------------------------------------------------------
//  友達の家：インターホン → 叫ぶ
// ---------------------------------------------------------------------
function updateDoor() {
  const p = G.p;
  p.lean *= 0.9; p.omega = 0;
  if (pressed.KeyE) {
    Sound.play('se_doorbell');
    G.state = 'intercom';
    G.ic = { t: 0, listening: false, reply: Horror.late() ? HORROR_TEXT.ding : TEXT.intercom.ding, lastHeard: '' };
  }
}

function updateIntercom() {
  const ic = G.ic;
  ic.t++;
  Voice.update();
  if (LEVEL.horrorStart != null) {
    Horror.intercom(ic);
  } else {
    if (ic.t === 70) ic.reply = TEXT.intercom.greet;
    if (ic.t === 90 && !ic.listening) startListening(ic);
  }
  if (ic.listening && pressed.KeyT && typingInput.hidden) showTyping();
  // マイクが使えない環境では自動でタイピングモードへ（音声認識だけ使えない時は叫び判定で続ける）
  if (ic.listening && !ic.autoTyping && typingInput.hidden && ic.t > 150 &&
      (Voice.lastError === 'not-allowed' || Voice.lastError === 'audio-capture' || (Voice.micError && !Voice.hasMic))) {
    ic.autoTyping = true;
    showTyping();
  }
}

// 聞き取りを始める：音声認識＋叫び判定。マイクが無ければタイピングモード
function startListening(ic) {
  ic.listening = true;
  Voice.start(onVoiceResult, onShoutResult).then(() => {
    if (!Voice.hasMic && scene === 'play' && G.state === 'intercom' && typingInput.hidden) { ic.autoTyping = true; showTyping(); }
  });
}

// 音声認識が何も返さなかったけど、大きな声で「トリックオアトリート」くらいの長さを叫んだ
function onShoutResult() {
  if (scene !== 'play' || G.state !== 'intercom') return;
  G.stats.shouts++;
  G.ic.lastHeard = '（叫び判定）';
  success();
}

// alts: 認識候補（最大5つ）。途中結果でも合言葉＆声量OKなら即クリア
function onVoiceResult(alts, isFinal) {
  if (scene !== 'play' || G.state !== 'intercom') return;
  const ic = G.ic;
  const hit = alts.find(isTrickOrTreat);
  const loud = !Voice.hasMic || Voice.recentPeak >= Voice.loudLine;
  if (hit && loud) {
    G.stats.shouts++;
    ic.lastHeard = hit;
    success();
    return;
  }
  if (!isFinal) return;
  G.stats.shouts++;
  ic.lastHeard = alts[0];
  const scary = LEVEL.horrorStart != null;
  if (hit) {
    ic.reply = scary ? HORROR_TEXT.quiet : TEXT.intercom.quiet;
  } else {
    ic.reply = tx(scary ? HORROR_TEXT.wrong : TEXT.intercom.wrong, { heard: alts[0] });
  }
  Voice.levels = [];
  Sound.play('se_wrong');
}

function showTyping() {
  typingInput.hidden = false;
  typingInput.value = '';
  typingInput.focus();
}
function hideTyping() {
  typingInput.hidden = true;
  typingInput.blur();
}

typingInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (scene !== 'play' || !G || G.state !== 'intercom') return;
  const text = typingInput.value;
  typingInput.value = '';
  G.stats.shouts++;
  G.ic.lastHeard = text;
  const bangs = (text.match(/[!！]/g) || []).length;
  const scary = LEVEL.horrorStart != null;
  if (!isTrickOrTreat(text)) {
    G.ic.reply = tx(scary ? HORROR_TEXT.wrong : TEXT.intercom.wrong, { heard: text });
    Sound.play('se_wrong');
  } else if (bangs < CONFIG.TYPING_EXCLAMATIONS) {
    G.ic.reply = tx(scary ? HORROR_TEXT.typingQuiet : TEXT.intercom.typingQuiet, { n: CONFIG.TYPING_EXCLAMATIONS });
    Sound.play('se_wrong');
  } else {
    success();
  }
});

function success() {
  Voice.stop();
  hideTyping();
  split();
  if (LEVEL.horrorStart != null) {
    finishRun();
    Horror.startEnding();
    return;
  }
  G.state = 'clear';
  G.clearT = 0;
  G.ic.reply = TEXT.intercom.clear;
  Sound.play('se_clear');
  finishRun();
}

function updateClear() {
  G.clearT++;
  if (G.clearT > 180) { scene = 'result'; Sound.playBgm('bgm_result'); }
}

// ---------------------------------------------------------------------
//  スプリット・記録
// ---------------------------------------------------------------------
function split() {
  const i = G.splitIdx;
  const t = G.frame;
  const prev = i > 0 ? G.splitTimes[i - 1] : 0;
  const seg = t - prev;
  const gold = G.data.golds[i] == null || seg < G.data.golds[i];
  G.splitTimes.push(t);
  G.splitGold.push(gold);
  G.splitIdx++;
  Sound.play('se_split');
  const pb = G.cmpPB;
  if (pb) {
    const delta = t - pb.splits[i];
    msg(`${LEVEL.splits[i].name}  ${RTA.fmt(delta, true)}`, gold ? '#ffd700' : delta < 0 ? '#5f5' : '#f66');
  }
}

function finishRun() {
  const data = G.data;
  const total = G.frame;
  data.completed++;
  G.splitTimes.forEach((t, i) => {
    const seg = t - (i > 0 ? G.splitTimes[i - 1] : 0);
    if (data.golds[i] == null || seg < data.golds[i]) data.golds[i] = seg;
  });
  G.prevPB = data.pb ? data.pb.total : null;
  G.isPB = !data.pb || total < data.pb.total;
  if (G.isPB) {
    data.pb = { total, igt: G.igt, splits: G.splitTimes.slice(), date: Date.now() };
    data.ghost = G.ghostRec.frames;
  }
  RTA.save(G.key, data);
}

// ---------------------------------------------------------------------
//  描画
// ---------------------------------------------------------------------
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (scene === 'title') renderTitle();
  else if (scene === 'howto') renderHowto();
  else if (scene === 'mictest') renderMicTest();
  else if (scene === 'killed') Secret.renderKilled();
  else {
    renderWorld();
    renderHUD();
    if (scene === 'play') { Horror.overlay(); Secret.renderBoard(); }
    if (scene === 'result') renderResult();
  }
}

function drawSky(scrollX) {
  Scenery.backdrop(scrollX, 0, 0);
}

function renderWorld() {
  const p = G.p;
  const hz = Horror.level();
  Scenery.backdrop(G.camX, G.camY, hz);
  ctx.save();
  const [shx, shy] = Secret.shake();
  ctx.translate(-Math.round(G.camX) + shx, -Math.round(G.camY) + shy);
  const x0 = G.camX - 200, x1 = G.camX + W + 200;
  const vis = (x, m = 300) => x > x0 - m && x < x1 + m;

  // 木・家
  Scenery.worldTrees(x0, x1);
  LEVEL.houses.forEach((hx, i) => {
    if (!vis(hx)) return;
    const by = baseY(hx, 190);
    Assets.draw(ctx, 'house', hx, by, 190, 180, 0, (c, w, h) => Placeholder.house(c, w, h, i));
    Scenery.houseDeco(hx, by, i, hz);
  });
  Horror.worldBack(x0, x1);
  if (vis(LEVEL.grandma)) {
    Assets.draw(ctx, 'house_grandma', LEVEL.grandma + 80, baseY(LEVEL.grandma + 80, 260), 260, 200, 0, Placeholder.house_grandma);
    Scenery.pumpkinDeco(LEVEL.grandma + 190, groundY(LEVEL.grandma + 190));
  }
  if (vis(LEVEL.grandpa)) {
    Assets.draw(ctx, 'house_grandpa', LEVEL.grandpa + 80, baseY(LEVEL.grandpa + 80, 260), 260, 200, 0, Placeholder.house_grandpa);
  }
  if (vis(LEVEL.END_X)) {
    if (LEVEL.horrorStart != null) Horror.drawFriendHouse(LEVEL.END_X + 10, baseY(LEVEL.END_X + 10, 320));
    else {
      Assets.draw(ctx, 'house_friend', LEVEL.END_X + 10, baseY(LEVEL.END_X + 10, 320), 320, 260, 0, Placeholder.house_friend);
      Scenery.pumpkinDeco(LEVEL.END_X - 110, groundY(LEVEL.END_X));
      Scenery.pumpkinDeco(LEVEL.END_X + 130, groundY(LEVEL.END_X));
    }
  }

  // 地面・街灯・電柱
  Scenery.ground(x0, x1, hz);
  Horror.worldGraffiti(x0, x1);
  Scenery.lamps(x0, x1, hz);
  Secret.drawPoles(x0, x1);
  // 距離の目印（100mごと）
  ctx.fillStyle = '#8a7a9a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
  for (let m = Math.max(0, Math.ceil(meters(x0 - LEVEL.START_X) / 100) * 100); m * CONFIG.PX_PER_METER + LEVEL.START_X < x1; m += 100) {
    const x = m * CONFIG.PX_PER_METER + LEVEL.START_X;
    ctx.fillRect(x - 1, groundY(x), 2, 14);
    ctx.fillText(`${m}m`, x, groundY(x) + 32);
  }

  // 横断歩道・信号・おまわりさん
  for (const sig of LEVEL.signals) {
    const cw0 = sig.x, cw1 = sig.x + 300;
    if (!vis(cw0)) continue;
    ctx.fillStyle = '#ddd';
    for (let x = cw0; x < cw1; x += 40) ctx.fillRect(x, groundY(x) - 3, 24, 6);
    // 停止線
    const sy = groundY(sig.x);
    ctx.fillStyle = '#fff'; ctx.fillRect(sig.x - 6, sy - 4, 8, 10);
    text('止まれ', sig.x - 60, sy + 26, 16, '#fff', 'center', true);
    const red = G.started ? isRed(sig) : true;
    const remain = G.started ? signalRemainSec(sig) : Math.ceil(CONFIG.SIGNAL_RED / CONFIG.FPS);
    const blinkOff = !red && remain <= 2 && Math.floor(globalTick / 10) % 2 === 0; // 青の点滅
    if (!blinkOff) {
      Assets.draw(ctx, red ? 'signal_red' : 'signal_green', sig.x - 30, sy, 40, 200, 0, red ? Placeholder.signal_red : Placeholder.signal_green);
    } else {
      Assets.draw(ctx, 'signal_green', sig.x - 30, sy, 40, 200, 0, Placeholder.signal_green, 0.35);
    }
    // 残り秒数（歩行者信号の待ち時間表示みたいなやつ）
    const bx = sig.x + 10, by = sy - 210;
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(bx, by, 74, 60);
    ctx.strokeStyle = red ? '#ff4040' : '#40ff70'; ctx.lineWidth = 3; ctx.strokeRect(bx, by, 74, 60);
    text(String(remain), bx + 37, by + 40, 34, red ? '#ff6060' : '#60ff90', 'center', true);
    text(red ? 'あと' : '青', bx + 37, by - 6, 13, '#ddd', 'center');
    const px = G.state === 'police' && G.policeSig === sig ? p.x + 60 - Math.min(60, G.policeT) : cw1 + 50;
    Assets.draw(ctx, 'police', px, groundY(px), 56, 100, 0, Placeholder.police);
  }

  // 水たまり・柵・お菓子・猫
  for (const [a, b] of LEVEL.puddles) {
    if (vis(a, b - a)) Assets.draw(ctx, 'puddle', (a + b) / 2, groundY((a + b) / 2) + 6, b - a, 20, 0, Placeholder.puddle);
  }
  for (const fx of LEVEL.fences) if (vis(fx)) Assets.draw(ctx, 'fence', fx, groundY(fx), 40, CONFIG.FENCE_H, 0, Placeholder.fence);
  for (const cd of G.candies) {
    if (cd.taken || !vis(cd.x)) continue;
    const cy = groundY(cd.x) - 4 + Math.sin(globalTick / 10 + cd.x) * 3;
    if (LEVEL.horrorStart != null && cd.x > LEVEL.horrorStart) Assets.draw(ctx, 'horror_eye_candy', cd.x, cy, 28, 28, 0, drawEyeCandy);
    else Assets.draw(ctx, 'candy', cd.x, cy, 36, 24, 0, Placeholder.candy);
  }
  for (const cat of G.cats) {
    if (vis(cat.x)) {
      ctx.save();
      ctx.translate(cat.x, groundY(cat.x));
      ctx.scale(cat.fled || cat.dir > 0 ? 1 : -1, 1);
      Assets.draw(ctx, 'cat', 0, 0, 56, 40, 0, (c, w, h) => Placeholder.cat(c, w, h, cat.phase));
      ctx.restore();
    }
  }

  // おばあちゃん
  if (vis(LEVEL.grandpa) || G.state === 'carry') {
    const px = grandpaX();
    Assets.draw(ctx, 'grandpa', px, groundY(px), 56, 96, 0, Placeholder.grandpa);
  }
  if (vis(LEVEL.grandma)) {
    const gx = grandmaX();
    if (G.grandmaDead) Secret.drawDeadGrandma(gx);
    else Assets.draw(ctx, 'grandma', gx, groundY(gx), 54, 90, 0, Placeholder.grandma);
    if (G.headless) Assets.draw(ctx, 'pumpkin_head', gx + 22, groundY(gx) - 28, 44, 44, 0, Placeholder.pumpkin_head);
  }
  // 友達
  if (LEVEL.horrorStart == null && ((G.state === 'intercom' && G.ic.t > 60) || G.state === 'clear')) {
    Assets.draw(ctx, 'friend', LEVEL.END_X + 30, groundY(LEVEL.END_X), 60, 100, 0, Placeholder.friend);
  }

  // ゴースト（自己ベスト）
  if (G.ghost && G.started && !Horror.active()) {
    const gp = ghostAt(G.ghost, G.frame);
    if (gp && vis(gp.x)) {
      const base = COSTUMES[costumeIdx];
      drawPlayer(gp, gp.headless ? Object.assign({}, base, base.headless) : base, 0.35);
      ctx.fillStyle = 'rgba(200,220,255,0.7)'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('PB', gp.x, gp.y - 110);
    }
  }
  Horror.worldFront();
  Secret.drawWorldFront();
  drawPlayer(p, G.c, 1);

  if (Assets.debugLabels) {
    ctx.strokeStyle = '#0ff';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.sin(p.lean) * 90, p.y - Math.cos(p.lean) * 90); ctx.stroke();
    ctx.strokeStyle = '#f00';
    for (const sig of LEVEL.signals) { ctx.beginPath(); ctx.moveTo(sig.x, groundY(sig.x) - 300); ctx.lineTo(sig.x, groundY(sig.x)); ctx.stroke(); }
  }
  ctx.restore();
  Scenery.foreground(hz);
  Horror.darkness();
}

function drawPlayer(p, c, alpha) {
  const w = 64, h = c.id === 'pumpkin' ? 96 : 84;
  const key = 'player_' + c.id + (c.rollWhenFallen === false && c.id === 'pumpkin' ? '_headless' : '');
  const phase = p.phase || 0;
  const fallback = (cx, w2, h2) => {
    if (c.id === 'ghost') Placeholder.player_ghost(cx, w2, h2, phase);
    else if (key === 'player_pumpkin_headless') Placeholder.player_pumpkin_headless(cx, w2, h2, phase);
    else if (c.id === 'pumpkin') Placeholder.player_pumpkin(cx, w2, h2, phase);
    else Placeholder.player_vampire(cx, w2, h2, phase, p.vy > 0 && !p.onGround ? 1 : 0);
  };
  if (p.fallen && c.rollWhenFallen) {
    // 転がるかぼちゃ（転がっているのは頭だけ）
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y - 34);
    ctx.rotate(p.roll ?? p.x / 28);
    Assets.draw(ctx, 'pumpkin_head', 0, 36, 72, 72, 0, Placeholder.pumpkin_head);
    ctx.restore();
    return;
  }
  if (alpha === 1 && p.boost > 0) {
    // ダッシュ中：うしろに流れる線
    ctx.strokeStyle = `rgba(255,210,120,${0.25 + 0.5 * (p.boost / CONFIG.CANDY_BOOST_FRAMES)})`; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const ly = p.y - 20 - i * 16, len = 30 + ((globalTick * 7 + i * 13) % 30);
      ctx.beginPath(); ctx.moveTo(p.x - 34, ly); ctx.lineTo(p.x - 34 - len, ly); ctx.stroke();
    }
  }
  // すり抜け中のおばけは透ける
  const a = alpha === 1 && p.phasing ? 0.35 + Math.sin(globalTick / 4) * 0.1 : alpha;
  Assets.draw(ctx, key, p.x, p.y, w, h, p.lean, fallback, a);
  if (alpha === 1 && p.invert > 0) {
    ctx.fillStyle = '#c080ff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('不吉 ' + (p.invert / 60).toFixed(1), p.x, p.y - h - 20);
  }
  if (alpha === 1 && !p.fallen && Math.abs(p.lean) > CONFIG.DANGER_ANGLE && scene === 'play' && G.state !== 'carry') {
    // 倒れそうな方向と逆のキーを頭上に出す（黒猫で反転中は反転後のキー）
    const needBack = p.lean > 0;
    const key = needBack !== (p.invert > 0) ? '←' : '→';
    const pulse = 1 + Math.sin(globalTick / 3) * 0.12;
    const kx = p.x + (needBack ? -1 : 1) * 10, ky = p.y - h - (p.invert > 0 ? 70 : 40);
    ctx.save();
    ctx.translate(kx, ky); ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ff3030'; ctx.fillRect(-26, -26, 52, 44);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(key, 0, 10);
    ctx.restore();
  }
}

function panel(x, y, w, h, a = 0.7) {
  ctx.fillStyle = `rgba(10,6,20,${a})`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,140,40,0.6)'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

// ホラー終盤〜ゲーム終了は、画面の文字が全部「壊れた画面」のフォントになる
function uiFont() { return Horror.late() && (scene === 'play' || scene === 'result') ? FONTS.glitch : FONTS.ui; }

function text(str, x, y, size = 20, color = '#fff', align = 'left', bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${uiFont()}`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function outlined(str, x, y, size, color, align = 'center', font = null) {
  ctx.font = font ? `${size}px ${font}` : `bold ${size}px ${uiFont()}`;
  ctx.textAlign = align;
  ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function renderHUD() {
  const p = G.p, data = G.data, pb = G.cmpPB;
  const late = Horror.late(), HT = HORROR_TEXT.hud;

  if (G.state === 'run' && !p.fallen && Math.abs(p.lean) > CONFIG.DANGER_ANGLE) {
    const k = (Math.abs(p.lean) - CONFIG.DANGER_ANGLE) / (CONFIG.FALL_ANGLE - CONFIG.DANGER_ANGLE);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${0.15 + k * 0.4})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // --- タイマー（左上） ---
  panel(16, 16, 300, 112);
  let tColor = '#fff';
  if (!G.started) tColor = '#aaa';
  else if (G.state === 'clear') tColor = G.isPB ? '#ffd700' : '#5f5';
  else if (pb && G.splitIdx < pb.splits.length && G.frame > pb.splits[G.splitIdx]) tColor = '#f66';
  text(Horror.timerText(RTA.fmt(G.frame)).padStart(7, ' '), 300, 72, 52, tColor, 'right', true);
  text(`IGT ${RTA.fmt(G.igt)}`, 30, 100, 15, '#ccc');
  text(late ? HT.igtNote : '（おばあちゃんはロード扱い）', 30, 118, 11, late ? '#a33' : '#999');
  text(`Frame ${G.frame} @${CONFIG.FPS}fps`, 300, 100, 12, '#888', 'right');
  text(`seed ${CONFIG.RNG_SEED}`, 300, 118, 11, '#666', 'right');

  // --- 進捗バー（上中央） ---
  const bx = 340, bw = 560, by = 30;
  panel(bx - 14, 16, bw + 28, 70);
  ctx.fillStyle = '#3a2a4a'; ctx.fillRect(bx, by + 18, bw, 6);
  const toBar = (x) => bx + clamp((x - LEVEL.START_X) / (LEVEL.END_X - LEVEL.START_X), 0, 1) * bw;
  ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
  const glitchMap = Horror.level() > 0.2;
  // 道のりの目印（小さな図形）
  for (const sig of LEVEL.signals) { const x = toBar(sig.x); ctx.fillStyle = '#222'; ctx.fillRect(x - 3, by + 2, 6, 12); ctx.fillStyle = '#f44'; ctx.fillRect(x - 2, by + 3, 4, 4); ctx.fillStyle = '#4f6'; ctx.fillRect(x - 2, by + 9, 4, 4); }
  if (LEVEL.grandma > 0) { ctx.fillStyle = '#c9a0d8'; ctx.beginPath(); ctx.arc(toBar(LEVEL.grandma), by + 8, 5, 0, Math.PI * 2); ctx.fill(); }
  if (LEVEL.grandpa > 0) { ctx.fillStyle = '#8aa0c8'; ctx.beginPath(); ctx.arc(toBar(LEVEL.grandpa), by + 8, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#111';
  for (const cx of LEVEL.cats) { const x = toBar(cx); ctx.beginPath(); ctx.arc(x, by + 10, 4, 0, Math.PI * 2); ctx.moveTo(x - 4, by + 8); ctx.lineTo(x - 3, by + 3); ctx.lineTo(x - 1, by + 7); ctx.moveTo(x + 4, by + 8); ctx.lineTo(x + 3, by + 3); ctx.lineTo(x + 1, by + 7); ctx.fill(); }
  { const x = toBar(LEVEL.END_X); ctx.fillStyle = glitchMap ? '#a00' : '#ff8a1c'; ctx.beginPath(); ctx.moveTo(x - 7, by + 7); ctx.lineTo(x, by); ctx.lineTo(x + 7, by + 7); ctx.fill(); ctx.fillRect(x - 5, by + 7, 10, 7); }
  if (G.ghost && G.started && !Horror.active()) {
    const gp = ghostAt(G.ghost, G.frame);
    ctx.fillStyle = 'rgba(180,200,255,0.7)';
    ctx.beginPath(); ctx.arc(toBar(gp.x), by + 21, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ff8a1c';
  ctx.beginPath(); ctx.arc(toBar(p.x), by + 21, 8, 0, Math.PI * 2); ctx.fill();
  const remain = Math.max(0, meters(LEVEL.END_X - p.x));
  text(Horror.distanceText(remain) || `友達の家まで あと ${(remain / 1000).toFixed(3)} km`, bx + bw / 2, by + 48, 15, '#ddd', 'center');

  // --- スプリット（右） ---
  const sx = W - 316, sw = 300;
  const rows = LEVEL.splits.length;
  const rh = rows > 7 ? 24 : 30;
  panel(sx, 16, sw, 96 + rows * rh);
  text(categoryName(G.c, LEVEL), sx + 14, 42, 17, '#ff9a3c', 'left', true);
  text(`#${data.attempts}`, sx + sw - 14, 42, 14, '#aaa', 'right');
  LEVEL.splits.forEach((s, i) => {
    const y = 72 + i * rh;
    const cur = i === G.splitIdx && G.started && G.state !== 'clear';
    if (cur) { ctx.fillStyle = 'rgba(80,60,140,0.6)'; ctx.fillRect(sx + 4, y - rh + 8, sw - 8, rh - 2); }
    text(Horror.splitName(s.name, i), sx + 14, y, 14, '#eee');
    let delta = '', dc = '#fff', time = '-';
    if (i < G.splitTimes.length) {
      time = RTA.fmt(G.splitTimes[i]);
      if (pb) {
        const d = G.splitTimes[i] - pb.splits[i];
        delta = RTA.fmt(d, true);
        dc = G.splitGold[i] ? '#ffd700' : d < 0 ? '#5f5' : '#f66';
      } else if (G.splitGold[i]) { delta = '★'; dc = '#ffd700'; }
    } else if (pb) {
      time = RTA.fmt(pb.splits[i]);
      if (cur && G.frame > pb.splits[i]) { delta = RTA.fmt(G.frame - pb.splits[i], true); dc = '#f66'; }
    }
    text(delta, sx + 200, y, 14, dc, 'right', true);
    text(time, sx + sw - 14, y, 14, i < G.splitTimes.length ? '#fff' : '#888', 'right');
  });
  const sob = RTA.sumOfBest(data);
  const fy = 72 + rows * rh + 4;
  text(late ? HT.sob : 'Sum of Best', sx + 14, fy, 13, '#aaa');
  text(RTA.fmt(sob), sx + sw - 14, fy, 13, '#aaa', 'right');
  text(late ? HT.pb : 'Personal Best', sx + 14, fy + 20, 13, '#aaa');
  text(data.pb ? RTA.fmt(data.pb.total) : '-', sx + sw - 14, fy + 20, 13, '#aaa', 'right');

  // --- 状態（左） ---
  const headMass = G.c.headMass + Math.min(p.weight, CONFIG.CANDY_WEIGHT_MAX) * CONFIG.CANDY_WEIGHT;
  panel(16, 140, 300, 92);
  text(late ? tx(HT.candies, { n: p.weight }) : `拾ったお菓子 ${p.weight}個（頭の重さ ×${headMass.toFixed(2)}）`, 28, 166, 14, late ? '#f44' : '#ffb0d8');
  if (p.boost > 0) text(`ダッシュ ${(p.boost / 60).toFixed(1)}`, 300, 166, 14, '#ffd27a', 'right', true);
  // 傾きメーター
  text(late ? HT.lean : '傾き', 28, 196, 14, '#ccc');
  ctx.fillStyle = 'rgba(255,60,60,0.5)'; ctx.fillRect(70, 186, 230, 12);
  const zone = (a, color) => { const zw = (a / CONFIG.FALL_ANGLE) * 115; ctx.fillStyle = color; ctx.fillRect(185 - zw, 186, zw * 2, 12); };
  zone(CONFIG.DANGER_ANGLE, 'rgba(255,200,60,0.5)');
  zone(CONFIG.LEAN_SPRING_LIMIT, '#2a4a2a');
  const lx = 185 + clamp(p.lean / CONFIG.FALL_ANGLE, -1, 1) * 115;
  ctx.fillStyle = Math.abs(p.lean) > CONFIG.DANGER_ANGLE ? '#f44' : Math.abs(p.lean) > CONFIG.LEAN_SPRING_LIMIT ? '#fc4' : '#5f5';
  ctx.fillRect(lx - 4, 182, 8, 20);
  const kmh = `${(p.vx * CONFIG.FPS / CONFIG.PX_PER_METER * 3.6).toFixed(1)} km/h`;
  text(late ? tx(HT.speed, { v: kmh }) : `速度 ${kmh}`, 28, 222, 14, '#ccc');
  const sigNear = G.started && nextSignal();
  if (sigNear) {
    const red = isRed(sigNear);
    text(`信号 ${red ? '赤' : '青'} あと${signalRemainSec(sigNear)}秒`, 300, 222, 14, red ? '#f66' : '#5f5', 'right');
  }

  // --- 入力表示（左下） ---
  const keysShown = [['A', 'KeyA'], ['D', 'KeyD'], ['←', 'ArrowLeft'], ['→', 'ArrowRight'], ['SPACE', 'Space'], ['E', 'KeyE']];
  if (G.c.phase) keysShown.push(['SHIFT', 'ShiftLeft']);
  let kx = 16;
  panel(12, H - 66, G.c.phase ? 528 : 410, 54, 0.5);
  for (const [label, code] of keysShown) {
    const w = label.length > 2 ? 110 : 52;
    const on = keys[code] || (code === 'ShiftLeft' && keys.ShiftRight);
    ctx.fillStyle = on ? '#ff8a1c' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(kx + 6, H - 58, w, 38);
    text(label, kx + 6 + w / 2, H - 32, 16, on ? '#000' : '#ccc', 'center', true);
    kx += w + 8;
  }

  // --- メッセージ ---
  G.msgs.forEach((m, i) => {
    ctx.globalAlpha = Math.min(1, m.t / 20);
    outlined(m.text, W / 2, 200 + i * 44, m.font ? 38 : m.big ? 34 : 24, m.color, 'center', m.font);
    ctx.globalAlpha = 1;
  });

  // --- ヒント ---
  let hint = '';
  if (Horror.active() && G.state === 'run') {
    hint = Horror.hint(); // ホラーの「にげて」は毎回出す
  } else {
    let k = null;
    if (!G.started) k = ['start', TEXT.hint.start];
    else if (p.fallen && G.state === 'run') { if (p.fallFrames >= CONFIG.GETUP_MIN_FRAMES) k = G.c.rollWhenFallen ? ['getUpPumpkin', TEXT.hint.getUpPumpkin] : ['getUp', TEXT.hint.getUp]; }
    else if (G.state === 'door') k = ['door', TEXT.hint.door];
    else if (G.state === 'run') k = contextHint();
    hint = k ? onceHint(k[0], k[1]) : onceHint(null);
  }
  if (hint) outlined(hint, W / 2, H - 100, Horror.active() ? 30 : 22, Horror.active() ? '#ff3030' : '#ffe9a0', 'center', Horror.active() ? FONTS.horror : null);
  text(late ? HORROR_TEXT.hud.controls : 'R: リセット  Esc: タイトル  F1: デバッグ  M: ミュート', W - 16, H - 14, 12, late ? '#a33' : '#888', 'right');

  if (G.state === 'grandma') renderGrandma();
  if (G.state === 'carry') {
    const t = G.carry.t;
    if (t < 30) outlined(TEXT.carry.dodge, W / 2, 260, 44, '#a8c0ff');
    if (t >= 60 && t < 190) {
      const sh = t < 90 ? 6 : 2;
      outlined(TEXT.carry.shout, W / 2 + (Math.random() - 0.5) * sh, 250 + (Math.random() - 0.5) * sh, 72, '#ff4a3a');
    }
    if (t >= 160) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (t - 160) / 30)})`; ctx.fillRect(0, 0, W, H); }
  }
  if (G.state === 'harvest') {
    const gx = grandmaX();
    bubble(gx - G.camX, groundY(gx) - G.camY - 96, GRANDMA_HARVEST_LINES[G.harvest.line], 18);
  }
  if (G.state === 'intercom' || G.state === 'clear') renderIntercom();
}

// 近くにあるギミックに合わせて、画面下に「次にやること」を出す
// [種類, 文章] を返す
function contextHint() {
  const p = G.p;
  const ahead = (x, d) => x - p.x > -10 && x - p.x < d;
  if (p.invert > 0) return ['cursed', TEXT.hint.cursed];
  if (LEVEL.fences.some((fx) => ahead(fx, 320))) return G.c.phase ? ['fenceGhost', TEXT.hint.fenceGhost] : ['fence', TEXT.hint.fence];
  if (G.cats.some((ct) => !ct.fled && ahead(ct.x, 360))) return ['cat', TEXT.hint.cat];
  const sig = nextSignal(900);
  if (sig && ahead(sig.x, 900)) {
    return ['signal', isRed(sig)
      ? tx(TEXT.hint.red, { sec: signalRemainSec(sig), m: meters(CONFIG.POLICE_WARP_BACK) })
      : tx(TEXT.hint.green, { sec: signalRemainSec(sig) })];
  }
  if (p.weight === 0 && G.candies.some((cd) => !cd.taken && ahead(cd.x, 220))) return ['candy', TEXT.hint.candy];
  if (LEVEL.puddles.some(([a, b]) => p.x > a - 200 && p.x < b)) return ['puddle', TEXT.hint.puddle];
  if (Math.abs(LEVEL.grandma - p.x) < 500 && !G.grandmaDone) return ['grandma', TEXT.hint.grandma];
  if (Math.abs(LEVEL.grandpa - p.x) < 500 && !G.grandpaDone) return ['grandpa', TEXT.hint.grandpa];
  return null;
}

// チュートリアル（ヒント）は種類ごとに1回だけ：最初に出た場面が終わったら、もう出さない
const HINT_DONE = new Set();
let hintShowing = null;
function onceHint(key, str = '') {
  if (hintShowing && hintShowing !== key) { HINT_DONE.add(hintShowing); hintShowing = null; }
  if (!key || HINT_DONE.has(key)) return '';
  hintShowing = key;
  return str;
}

function keycap(x, y, label, lit = false, w = 56) {
  ctx.fillStyle = lit ? '#ff8a1c' : '#2a2238';
  ctx.fillRect(x - w / 2, y - 30, w, 52);
  ctx.fillStyle = lit ? '#c45a00' : '#15101f';
  ctx.fillRect(x - w / 2, y + 16, w, 6);
  ctx.strokeStyle = lit ? '#ffd27a' : '#6a5a8a'; ctx.lineWidth = 2;
  ctx.strokeRect(x - w / 2, y - 30, w, 52);
  text(label, x, y + 6, label.length > 2 ? 18 : 26, lit ? '#000' : '#fff', 'center', true);
}

function renderHowto() {
  const c = COSTUMES[costumeIdx];
  const t = globalTick;
  drawSky(t);
  ctx.fillStyle = 'rgba(5,3,12,0.6)'; ctx.fillRect(0, 0, W, H);
  outlined('あそびかた', W / 2, 60, 40, '#ff8a1c');
  const card = (i, title) => {
    const x = 40 + (i % 2) * 610, y = 86 + Math.floor(i / 2) * 270;
    panel(x, y, 590, 252, 0.85);
    text(title, x + 22, y + 38, 24, '#ffd27a', 'left', true);
    return { x, y };
  };
  const fake = (x, y, extra) => Object.assign({ x, y, lean: 0, phase: 0, vy: 0, onGround: true }, extra);

  // ① 歩く
  let { x, y } = card(0, '① 歩く');
  const beat = Math.floor(t / 18);
  keycap(x + 70, y + 108, 'A', beat % 2 === 0);
  keycap(x + 140, y + 108, 'D', beat % 2 === 1);
  text('を 交互に押す', x + 180, y + 116, 24, '#fff', 'left', true);
  drawPlayer(fake(x + 500, y + 170, { lean: 0.12, phase: beat * Math.PI / 2 }), c, 1);
  text('タン・タン・タン…とリズムよく', x + 30, y + 170, 18, '#ddd');
  text('同じ足を2回押すと つまずく', x + 30, y + 200, 18, '#ffb0b0');
  text('最初の一歩でタイマースタート', x + 30, y + 230, 15, '#aaa');

  // ② 踏ん張る
  ({ x, y } = card(1, '② 倒れそうになったら 踏ん張る'));
  const lean = Math.sin(t / 45) * 0.78;
  const danger = Math.abs(lean) > CONFIG.DANGER_ANGLE;
  drawPlayer(fake(x + 110, y + 220, { lean }), c, 1);
  if (danger) keycap(x + 110 + (lean > 0 ? -34 : 34), y + 92, lean > 0 ? '←' : '→', true);
  text('傾きすぎると 頭の上に', x + 230, y + 98, 20, '#fff');
  text('赤いキー が出る', x + 230, y + 130, 24, '#ff6060', 'left', true);
  text('→ そのキーを押せばOK！', x + 230, y + 162, 20, '#fff');
  text('少しの傾きは 勝手に戻る', x + 230, y + 200, 16, '#aaa');
  text('転んだら Space / A / D で起き上がる', x + 230, y + 228, 16, '#aaa');

  // ③ 飛び越える
  ({ x, y } = card(2, '③ 飛び越える'));
  const ph = (t % 120) / 120;
  const jumping = ph > 0.3 && ph < 0.7;
  const jh = jumping ? Math.sin(((ph - 0.3) / 0.4) * Math.PI) * 70 : 0;
  keycap(x + 95, y + 108, 'SPACE', jumping, 130);
  text('でジャンプ', x + 175, y + 116, 24, '#fff', 'left', true);
  Assets.draw(ctx, 'fence', x + 470, y + 220, 40, CONFIG.FENCE_H, 0, Placeholder.fence);
  drawPlayer(fake(x + 360 + ph * 220, y + 220 - jh, { phase: jumping ? 0 : t / 5 }), c, 1);
  text('柵・黒猫は 飛び越える', x + 30, y + 166, 18, '#ddd');
  text('柵にぶつかったら その場でもう一回 Space', x + 30, y + 196, 16, '#ffb0b0');
  text('道のお菓子は拾うと重くなる → 避けよう', x + 30, y + 226, 16, '#ff9ad0');

  // ④ ゴール
  ({ x, y } = card(3, '④ 友達の家で 叫ぶ'));
  keycap(x + 70, y + 108, 'E', Math.floor(t / 30) % 2 === 0);
  text('でインターホンを押して…', x + 112, y + 116, 22, '#fff', 'left', true);
  outlined('「トリックオアトリート！」', x + 295, y + 172, 30, '#ff9a3c');
  text('マイクに向かって 大きな声で叫ぶとクリア', x + 295, y + 208, 17, '#ddd', 'center');
  text('反応しない時はタイトルで V（マイクテスト）／声を出せない所では T でタイピング', x + 295, y + 234, 14, '#aaa', 'center');

  text(`【${COURSES[courseIdx].name}】 ${c.name}の特徴：${c.desc.replace(/\n/g, ' ')}`, W / 2, 648, 16, '#ffe9a0', 'center');
  ctx.globalAlpha = 0.6 + Math.sin(t / 10) * 0.4;
  outlined('Enter / Space でスタート', W / 2, 694, 28, '#fff');
  ctx.globalAlpha = 1;
  text('Esc: もどる', W - 24, 700, 14, '#888', 'right');
}

// 会話ログ：言い終わった行は上に積み上がっていき、いちばん下に今しゃべっている行が出る
function drawChatLog(d, grandpa) {
  const top = 346, bottom = 676, left = 270, maxW = 820, size = 20, rowH = 27;
  const shown = d.lines.slice(0, d.line).concat([(d.lines[d.line] || '').slice(0, d.chars)]);
  ctx.save();
  ctx.beginPath(); ctx.rect(left - 10, top, maxW + 80, bottom - top); ctx.clip();
  let y = bottom;
  for (let i = shown.length - 1; i >= 0 && y > top; i--) {
    if (!shown[i]) continue;
    const rows = wrapText(shown[i], maxW, size);
    ctx.font = `bold ${size}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
    const bw = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 28;
    const bh = rows.length * rowH + 16;
    y -= bh;
    ctx.globalAlpha = Math.max(0.15, Math.min(1, (y - top + 60) / 140)); // 上に行くほど薄く
    const latest = i === shown.length - 1;
    ctx.fillStyle = latest ? (grandpa ? '#e6ecff' : '#fbeefa') : (grandpa ? '#c4cde8' : '#ddcfe0');
    roundRect(left, y, bw, bh, 14); ctx.fill();
    ctx.beginPath(); ctx.moveTo(left, y + 14); ctx.lineTo(left - 10, y + 22); ctx.lineTo(left, y + 26); ctx.fill(); // しっぽ
    ctx.fillStyle = '#1a1426'; ctx.textAlign = 'left';
    rows.forEach((r, k) => ctx.fillText(r, left + 14, y + 8 + (k + 1) * rowH - 6));
    y -= 10;
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// 幅 maxW に収まるように折り返す（日本語なので1文字ずつ）
function wrapText(str, maxW, size) {
  ctx.font = `bold ${size}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
  const out = [];
  let cur = '';
  for (const ch of str) {
    if (ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function bubble(x, y, str, size = 16) {
  ctx.font = `bold ${size}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
  const w = ctx.measureText(str).width + 20, h = size + 14;
  const bx = clamp(x - w / 2, 8, W - w - 8), by = y - h - 8;
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx, by, w, h);
  ctx.beginPath(); ctx.moveTo(x - 6, by + h); ctx.lineTo(x + 6, by + h); ctx.lineTo(x, by + h + 8); ctx.fill();
  ctx.fillStyle = '#111'; ctx.textAlign = 'center';
  ctx.fillText(str, bx + w / 2, by + h - 9);
}

function drawSkipBtn(b, d) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const speed = Math.hypot(b.vx, b.vy);
  const sleeping = b.exhaustT > 0;
  const w = b.w, h = b.h;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(sleeping ? 0.12 + Math.sin(globalTick / 20) * 0.03 : clamp(b.vx * 0.015, -0.3, 0.3));
  // 速く動くと伸びる（スクワッシュ＆ストレッチ）。捕まると潰れる
  const st = Math.min(0.35, speed * 0.025);
  let sx = 1 + st, sy = 1 - st * 0.7;
  if (b.real && d.hitstop > 0) { const k = d.hitstop / 50; sx = 1 + k * 0.6; sy = 1 - k * 0.45; }
  ctx.scale(sx, sy);

  ctx.fillStyle = sleeping ? '#b0702e' : '#ff8a1c';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-w / 2, h / 2 - 6, w, 6);

  // 顔
  const fx = -w / 2 + 28;
  ctx.fillStyle = '#111'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
  if (sleeping) {
    ctx.beginPath();
    ctx.moveTo(fx - 12, -5); ctx.lineTo(fx - 4, -5);
    ctx.moveTo(fx + 4, -5); ctx.lineTo(fx + 12, -5);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(fx, 8, 3, 0, Math.PI * 2); ctx.fill();
  } else {
    const ang = Math.atan2(mouse.y - cy, mouse.x - cx);
    const r = b.fear === 'panic' ? 7 : 5.5;
    for (const ex of [fx - 8, fx + 8]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, -6, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * (r - 3), -6 + Math.sin(ang) * (r - 3), 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath();
    if (b.fear === 'panic') ctx.ellipse(fx, 11, 4, 6, 0, 0, Math.PI * 2);
    else if (b.fear === 'alert') ctx.arc(fx, 10, 3, 0, Math.PI * 2);
    else { ctx.rect(fx - 5, 9, 10, 2); }
    ctx.fill();
    if (b.stamina < 40) {
      // 汗
      ctx.fillStyle = '#7fd0ff';
      const dy = (globalTick % 30) / 2;
      ctx.beginPath(); ctx.arc(fx + 18, -12 + dy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx + 15, -12 + dy); ctx.lineTo(fx + 18, -19 + dy); ctx.lineTo(fx + 21, -12 + dy); ctx.fill();
    }
  }
  const label = sleeping ? 'す…きっぷ…' : b.label;
  text(label, 18, 7, 19, '#000', 'center', true);
  ctx.restore();
  if (sleeping) text('z'.repeat(1 + (Math.floor(globalTick / 20) % 3)), b.x + b.w - 6, b.y - 4, 18, '#fff', 'left', true);
  if (b.sayT > 0 && b.say) bubble(cx, b.y - (sleeping ? 14 : 4), b.say, 15);
}

function renderGrandma() {
  const d = G.dialog, b = d.btn, ai = d.ai;
  ctx.save();
  if (d.hitstop > 35) ctx.translate((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
  panel(40, 300, W - 80, 390, 0.88);

  // 残像 → ボタン（おばあちゃんより奥に描くので、後ろに隠れられる）
  for (const tr of d.trail) {
    ctx.globalAlpha = tr.a;
    ctx.fillStyle = tr.real ? '#ff8a1c' : '#ffb070';
    ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
  }
  ctx.globalAlpha = 1;
  for (const dcy of d.decoys) drawSkipBtn(dcy, d);
  drawSkipBtn(b, d);

  const grandpa = d.who === 'grandpa';
  if (grandpa) Assets.draw(ctx, 'grandpa', 150, 670, 140, 220, 0, Placeholder.grandpa);
  else Assets.draw(ctx, 'grandma', 150, 670, 140, 200, 0, Placeholder.grandma);
  if (d.grandmaSay) bubble(170, 440, d.grandmaSay.text, 16);
  text(grandpa ? TEXT.grandpaLabel : TEXT.grandmaLabel, 270, 334, 18, grandpa ? '#a8c0ff' : '#ffb0e0', 'left', true);
  text(`（${d.line + 1}/${d.lines.length}）`, W - 70, 334, 14, d.extra ? '#f88' : '#888', 'right');
  drawChatLog(d, grandpa);

  // カーソルの未来予測を可視化（config の SKIP_SHOW_PREDICTION）
  if (CONFIG.SKIP_SHOW_PREDICTION && mouse.y > SKIP_AREA.y - 40 && d.hitstop === 0) {
    ctx.strokeStyle = 'rgba(80,220,255,0.7)'; ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(ai.px, ai.py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(ai.px, ai.py, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ai.px - 20, ai.py); ctx.lineTo(ai.px + 20, ai.py);
    ctx.moveTo(ai.px, ai.py - 20); ctx.lineTo(ai.px, ai.py + 20);
    ctx.stroke();
    text(`予測 +${CONFIG.SKIP_PREDICT_FRAMES}f`, ai.px + 18, ai.py - 16, 12, 'rgba(80,220,255,0.9)');
  }

  // AIステータス
  const px = 340, py = 100;
  panel(px, py, 300, 112, 0.85);
  text('SKIP-BTN AI  v10.31', px + 14, py + 24, 15, '#80dcff', 'left', true);
  text('カーソル予測精度', px + 14, py + 47, 13, '#ddd');
  text(`${(ai.acc * 100).toFixed(1)}%`, px + 286, py + 47, 13, '#fff', 'right', true);
  text('回避 / 空振りさせた', px + 14, py + 68, 13, '#ddd');
  text(`${ai.dodges}回 / ${ai.misses}回`, px + 286, py + 68, 13, '#fff', 'right', true);
  text('スタミナ', px + 14, py + 96, 13, '#ddd');
  ctx.fillStyle = '#333'; ctx.fillRect(px + 80, py + 85, 200, 14);
  ctx.fillStyle = b.stamina > 60 ? '#5f5' : b.stamina > 30 ? '#fc4' : '#f55';
  ctx.fillRect(px + 80, py + 85, 2 * b.stamina, 14);
  if (b.exhaustT > 0) outlined('おやすみ中！今だ！', px + 180, py + 98, 15, '#ffe080');

  // エフェクト
  for (const f of d.fx) {
    ctx.globalAlpha = Math.min(1, f.t / 15);
    if (f.kind === 'confetti') {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot);
      ctx.fillStyle = f.color; ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    } else {
      outlined(f.str, f.x, f.y, 22, f.color);
    }
  }
  ctx.globalAlpha = 1;
  if (d.hitstop > 0) {
    const k = 1 + Math.max(0, d.hitstop - 40) * 0.08;
    ctx.save();
    ctx.translate(W / 2, 400); ctx.scale(k, k);
    outlined('SKIP!!', 0, 0, 90, '#ffd700');
    ctx.restore();
    outlined(`約${(d.saved / CONFIG.FPS).toFixed(1)}秒 短縮`, W / 2, 450, 28, '#fff');
  }
  ctx.restore();
}

function renderIntercom() {
  const ic = G.ic;
  const late = Horror.late();
  panel(240, 250, 800, 230, 0.9);
  text(late ? HORROR_TEXT.intercomLabel : 'インターホン', 264, 284, 18, late ? '#a00' : '#ffd27a', 'left', true);
  if (late) outlined(ic.reply, W / 2, 338, 34, '#ff3030', 'center', FONTS.kid); // 「ともだち」の声は子どもの字
  else outlined(ic.reply, W / 2, 334, 26, '#fff');
  if (G.state === 'clear') return;
  if (!ic.listening) return;
  if (!typingInput.hidden) {
    outlined(late ? HORROR_TEXT.typingMode : 'タイピングモード', W / 2, 384, 22, late ? '#c00' : '#ff9a3c');
    text(late ? tx(HORROR_TEXT.typingHelp, { n: CONFIG.TYPING_EXCLAMATIONS }) : `声の代わりに「！」を${CONFIG.TYPING_EXCLAMATIONS}個以上つけて Enter`, W / 2, 420, 17, '#ddd', 'center');
    return;
  }
  if (Voice.hasMic || Voice.supported) {
    outlined(late ? HORROR_TEXT.shout : TEXT.intercom.shout, W / 2, 380, 22, late ? '#c00' : '#ff9a3c');
    drawVoiceMeter(340, 410, 600);
    text(Voice.statusText(), 264, 452, 13, Voice.lastError ? '#f88' : '#9c9');
    const heard = Voice.interim || Voice.lastFinal;
    if (heard) text(`聞こえてる: ${heard}`, W / 2, 473, 15, '#ddd', 'center');
    text('T: タイピングモード', 1030, 452, 12, '#777', 'right');
  } else {
    outlined('音声認識が使えないので、声の代わりに入力してください', W / 2, 380, 20, '#ff9a3c');
  }
}

function renderResult() {
  const data = G.data;
  ctx.fillStyle = 'rgba(5,3,12,0.82)'; ctx.fillRect(0, 0, W, H);
  const late = Horror.late(), HR = HORROR_TEXT.result;
  if (LEVEL.horrorStart != null) {
    outlined(HORROR_TEXT.resultTitle, W / 2 + (Math.random() - 0.5) * 3, 90, 56, '#c00000', 'center', FONTS.horror);
    outlined(HORROR_TEXT.resultSub, W / 2, 132, 18, '#a44', 'center', FONTS.kid);
  } else {
    outlined(TEXT.result.title, W / 2, 90, 46, '#ff9a3c');
    text(tx(TEXT.result.sub, { n: G.stats.candies }), W / 2, 128, 16, '#ccc', 'center');
  }

  outlined(RTA.fmt(G.frame), W / 2, 210, 72, G.isPB ? '#ffd700' : '#fff');
  if (late) outlined(G.isPB ? (G.prevPB == null ? HR.pbFirst : HR.pb) : HR.notPb, W / 2, 258, 30, '#c00', 'center', FONTS.kid);
  else if (G.isPB) outlined(G.prevPB == null ? '初完走！ PB更新！' : `PB更新！ (${RTA.fmt(G.frame - G.prevPB, true)})`, W / 2, 255, 26, '#ffd700');
  else text(`PB ${RTA.fmt(data.pb.total)}（${RTA.fmt(G.frame - data.pb.total, true)}）`, W / 2, 255, 20, '#f88', 'center');
  text(`RTA ${RTA.fmt(G.frame)}　/　IGT ${RTA.fmt(G.igt)}　/　${categoryName(G.c, LEVEL)}`, W / 2, 285, 16, '#aaa', 'center');

  const rr = LEVEL.splits.length > 7 ? 24 : 28;
  panel(200, 310, 420, 40 + LEVEL.splits.length * rr);
  text(late ? HR.splitHead[0] : '区間', 220, 336, 14, '#aaa'); text(late ? HR.splitHead[1] : '区間タイム', 600, 336, 14, '#aaa', 'right');
  LEVEL.splits.forEach((s, i) => {
    const y = 364 + i * rr;
    const seg = G.splitTimes[i] - (i > 0 ? G.splitTimes[i - 1] : 0);
    text(late ? Horror.splitName(s.name, i) : s.name, 220, y, 16, '#eee');
    text((G.splitGold[i] ? '★ ' : '') + RTA.fmt(seg), 600, y, 16, G.splitGold[i] ? '#ffd700' : '#fff', 'right');
  });

  panel(660, 310, 420, 40 + 6 * 28);
  const st = G.stats;
  const stats = [
    ['転んだ回数', `${st.falls}回`],
    ['つまずいた回数', `${st.stumbles}回`],
    ['信号無視で連れ戻された', `${st.warps}回`],
    ['おばあちゃん', late ? HR.grandma : st.headStolen ? '頭を採集された' : st.skipped ? `スキップ（${(st.skipSaved / CONFIG.FPS).toFixed(1)}秒短縮）` : '全部聞いた'],
    ['叫んだ回数', `${st.shouts}回`],
    ['試行回数 / 完走', `${data.attempts} / ${data.completed}`],
  ];
  if (late) stats.forEach((row, i) => { row[0] = HR.stats[i]; });
  text(late ? HR.head : '記録', 680, 336, 14, '#aaa');
  stats.forEach(([k, v], i) => { text(k, 680, 364 + i * 28, 16, '#eee'); text(v, 1060, 364 + i * 28, 16, '#fff', 'right'); });

  outlined(late ? HR.back : 'R / Space: もう一回　　Enter: タイトルへ', W / 2, H - 40, 22, late ? '#c00' : '#ffe9a0');
}

function renderTitle() {
  drawSky(globalTick * 2);
  ctx.fillStyle = '#20182a'; ctx.fillRect(0, 600, W, 120);
  if (Assets.has('title_logo')) {
    const im = Assets.img.title_logo;
    const h = 150, w = (im.width / im.height) * h;
    ctx.drawImage(im, W / 2 - w / 2, 20, w, h);
  } else {
    outlined(TEXT.title.name, W / 2, 100, 64, '#ff8a1c');
    outlined(TEXT.title.sub, W / 2, 150, 24, '#ffe9a0');
  }
  COSTUMES.forEach((c, i) => {
    const cx = W / 2 + (i - 1) * 330;
    const sel = i === costumeIdx;
    panel(cx - 150, 190, 300, 380, sel ? 0.9 : 0.5);
    if (sel) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 4; ctx.strokeRect(cx - 150, 190, 300, 380); }
    const bob = sel ? Math.sin(globalTick / 8) * 6 : 0;
    drawPlayer({ x: cx, y: 360 + bob, lean: sel ? Math.sin(globalTick / 20) * 0.15 : 0, phase: sel ? globalTick / 5 : 0, vy: 0, onGround: true }, c, 1);
    text(c.name, cx, 400, 28, sel ? '#ffd700' : '#fff', 'center', true);
    c.desc.split('\n').forEach((l, j) => text(l, cx, 432 + j * 22, 14, '#ddd', 'center'));
    const d = RTA.load(rtaKey(c, COURSES[courseIdx]));
    text(`PB ${d.pb ? RTA.fmt(d.pb.total) : '--'}　試行 ${d.attempts}`, cx, 545, 15, '#aaa', 'center');
  });
  // コース（難易度）
  COURSES.forEach((co, i) => {
    const cx = W / 2 + (i - 1) * 230, sel = i === courseIdx;
    ctx.fillStyle = sel ? '#ff8a1c' : 'rgba(10,6,20,0.75)'; ctx.fillRect(cx - 105, 578, 210, 30);
    ctx.strokeStyle = sel ? '#ffd700' : 'rgba(255,140,40,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(cx - 105, 578, 210, 30);
    text(`${co.name}  ${(meters(co.END_X - co.START_X) / 1000).toFixed(1)}km`, cx, 599, 17, sel ? '#000' : '#fff', 'center', true);
  });
  outlined('← → 仮装　　↑ ↓ コース　　Enter スタート', W / 2, 642, 24, '#fff');
  text('A/D 交互に歩く　←→ 踏ん張る　Space ジャンプ/起き上がる　E インターホン　R リセット　M ミュート　V マイクテスト', W / 2, 672, 15, '#bbb', 'center');
  text('※ゴールではマイクで本当に「トリックオアトリート」と叫びます', W / 2, 698, 14, '#ff9a3c', 'center');
  text('X: 記録リセット', W - 16, 712, 12, '#777', 'right');
  text(TEXT.credit, 16, 712, 12, '#999');
  if (resetAsk) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 300, 240, 600, 220, 0.95);
    outlined('記録をぜんぶ消しますか？', W / 2, 300, 34, '#ff6a5a');
    text('全コース・全仮装の PB / ゴースト / 金区間 / 試行回数', W / 2, 344, 16, '#ddd', 'center');
    text(Horror.hardCleared ? '（ハードをクリアした証の「目玉の月」も元に戻ります）' : '（ハードをクリアした記録も消えます）', W / 2, 370, 15, '#aaa', 'center');
    outlined('Y: 消す　　N: やめる', W / 2, 425, 26, '#fff');
  }
}

// ---------------------------------------------------------------------
//  メインループ（60fps固定タイムステップ）
// ---------------------------------------------------------------------
let last = performance.now();
let acc = 0;
const STEP = 1000 / CONFIG.FPS;
function loop(now) {
  acc += Math.min(250, now - last);
  last = now;
  let n = 0;
  while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  render();
  requestAnimationFrame(loop);
}

// 怖いフォントを先に読み込んでおく（初めて出た瞬間に普通のフォントで見えてしまわないように）
// 日本語のフォントは使う文字の分だけ読み込まれるので、ゲームに出る文字を全部渡す。ネットが無ければ3秒であきらめる
function loadFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const sample = JSON.stringify([TEXT, HORROR_TEXT, HORROR_LINES]) + '0123456789:.-+？■□▒░▓';
  const families = [FONTS.horror, FONTS.kid, FONTS.glitch, FONTS.blood, ...FONTS.graffiti];
  const all = Promise.all(families.map((f) => document.fonts.load(`40px ${f}`, sample).catch(() => {})));
  return Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
}

Promise.all([Assets.load(), Sound.load(), ScareVideo.load(), loadFonts()]).then(() => {
  document.getElementById('loading').remove();
  toTitle();
  requestAnimationFrame(loop);
});
