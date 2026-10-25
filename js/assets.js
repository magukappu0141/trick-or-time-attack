// =====================================================================
//  画像ローダー：manifest のファイルがあれば使い、無ければ仮素材を描く
// =====================================================================
const Assets = {
  img: {},
  debugLabels: false,

  load() {
    const list = Object.entries(window.ASSET_MANIFEST.images);
    return Promise.all(list.map(([key, src]) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => { this.img[key] = im; resolve(); };
      im.onerror = () => { this.img[key] = null; resolve(); };
      im.src = src;
    })));
  },

  has(key) { return !!this.img[key]; },

  // 足元 (x, y) を下端中央として w×h で描く。rot はラジアン（足元中心で回転）
  // 画像が無ければ fallback(ctx, w, h) を同じ座標系で呼ぶ
  draw(ctx, key, x, y, w, h, rot = 0, fallback = null, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    const im = this.img[key];
    if (im) {
      ctx.drawImage(im, -w / 2, -h, w, h);
    } else if (fallback) {
      fallback(ctx, w, h);
    } else {
      ctx.fillStyle = '#f0f';
      ctx.fillRect(-w / 2, -h, w, h);
    }
    if (this.debugLabels) {
      ctx.strokeStyle = im ? '#0f0' : '#ff0';
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -h, w, h);
      ctx.fillStyle = im ? '#0f0' : '#ff0';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(key + (im ? '' : ' (仮)'), 0, -h - 4);
    }
    ctx.restore();
  },
};

// ---------------------------------------------------------------------
//  仮素材（すべてコードで描画）
// ---------------------------------------------------------------------
const Placeholder = {
  eyes(ctx, x, y, s = 1, color = '#111') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x - 7 * s, y, 3.5 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 7 * s, y, 3.5 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  legs(ctx, phase, color, len = 22, spread = 10) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const a = Math.sin(phase) * 0.5;
    ctx.beginPath();
    ctx.moveTo(-3, -len); ctx.lineTo(-3 + Math.sin(a) * spread, 0);
    ctx.moveTo(3, -len); ctx.lineTo(3 - Math.sin(a) * spread, 0);
    ctx.stroke();
  },

  player_ghost(ctx, w, h, phase = 0) {
    Placeholder.legs(ctx, phase, '#ccc', 12, 8);
    ctx.fillStyle = '#f4f4ff';
    ctx.beginPath();
    ctx.moveTo(-w / 2, -6);
    ctx.quadraticCurveTo(-w / 2, -h, 0, -h);
    ctx.quadraticCurveTo(w / 2, -h, w / 2, -6);
    for (let i = 0; i <= 6; i++) {
      const xx = w / 2 - (w / 6) * i;
      ctx.lineTo(xx, i % 2 ? -14 : -4);
    }
    ctx.closePath();
    ctx.fill();
    Placeholder.eyes(ctx, 0, -h * 0.7);
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(0, -h * 0.55, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  },

  player_pumpkin(ctx, w, h, phase = 0, headRot = 0) {
    Placeholder.legs(ctx, phase, '#3a2a55', 26, 10);
    ctx.fillStyle = '#3a2a55';
    ctx.fillRect(-10, -h * 0.5, 20, h * 0.5 - 22);
    ctx.save();
    ctx.translate(0, -h * 0.68);
    ctx.rotate(headRot);
    Placeholder.pumpkinHead(ctx, w * 0.6);
    ctx.restore();
  },

  player_pumpkin_headless(ctx, w, h, phase = 0) {
    Placeholder.legs(ctx, phase, '#3a2a55', 26, 10);
    ctx.fillStyle = '#3a2a55';
    ctx.fillRect(-10, -h * 0.5, 20, h * 0.5 - 22);
    // 首の切り口
    ctx.fillStyle = '#c45a00';
    ctx.beginPath(); ctx.ellipse(0, -h * 0.5, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('?', 0, -h * 0.6 + Math.sin(phase) * 2);
  },

  pumpkin_head(ctx, w, h) {
    ctx.save(); ctx.translate(0, -h / 2);
    Placeholder.pumpkinHead(ctx, Math.min(w, h) / 2);
    ctx.restore();
  },

  pumpkinHead(ctx, r) {
    ctx.fillStyle = '#ff8a1c';
    for (const dx of [-0.45, 0.45, 0]) {
      ctx.beginPath();
      ctx.ellipse(dx * r, 0, r * 0.65, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#c45a00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.85, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#3b7a2a';
    ctx.fillRect(-3, -r * 0.95, 6, 10);
    ctx.fillStyle = '#2a1100';
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.2); ctx.lineTo(-r * 0.2, -r * 0.2); ctx.lineTo(-r * 0.32, -r * 0.45); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.45, -r * 0.2); ctx.lineTo(r * 0.2, -r * 0.2); ctx.lineTo(r * 0.32, -r * 0.45); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, r * 0.2);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-r * 0.5 + (r / 6) * i, r * (i % 2 ? 0.35 : 0.5));
    ctx.lineTo(r * 0.5, r * 0.2);
    ctx.quadraticCurveTo(0, r * 0.3, -r * 0.5, r * 0.2);
    ctx.fill();
  },

  player_vampire(ctx, w, h, phase = 0, cape = 0) {
    Placeholder.legs(ctx, phase, '#222', 24, 10);
    ctx.fillStyle = '#7a0010';
    ctx.beginPath();
    ctx.moveTo(-12, -h * 0.75);
    ctx.lineTo(-w / 2 - cape * 18, -10 + cape * -20);
    ctx.lineTo(w / 2 + cape * 18, -10 + cape * -20);
    ctx.lineTo(12, -h * 0.75);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(-11, -h * 0.75, 22, h * 0.75 - 22);
    ctx.fillStyle = '#e8e0f0';
    ctx.beginPath(); ctx.arc(0, -h * 0.84, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath(); ctx.moveTo(-15, -h * 0.88); ctx.lineTo(0, -h * 0.97); ctx.lineTo(15, -h * 0.88); ctx.lineTo(0, -h - 2); ctx.fill();
    Placeholder.eyes(ctx, 0, -h * 0.85, 0.7, '#c00');
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-4, -h * 0.78); ctx.lineTo(-2, -h * 0.74); ctx.lineTo(0, -h * 0.78); ctx.fill();
  },

  house(ctx, w, h, seed = 0, lit = true) {
    const hues = ['#2b2440', '#33284a', '#262038', '#3a2c3e'];
    ctx.fillStyle = hues[seed % hues.length];
    ctx.fillRect(-w / 2, -h * 0.7, w, h * 0.7);
    ctx.fillStyle = '#1a1426';
    ctx.beginPath(); ctx.moveTo(-w / 2 - 12, -h * 0.7); ctx.lineTo(0, -h); ctx.lineTo(w / 2 + 12, -h * 0.7); ctx.fill();
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = (lit && (seed + i) % 3 !== 0) ? '#ffd27a' : '#151020';
      ctx.fillRect(-w / 2 + 18 + i * (w - 66), -h * 0.55, 30, 26);
    }
    ctx.fillStyle = '#120d1c';
    ctx.fillRect(-14, -50, 28, 50);
  },

  house_grandma(ctx, w, h) {
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(-w / 2, -h * 0.6, w, h * 0.6);
    ctx.fillStyle = '#2d4a3a';
    ctx.beginPath(); ctx.moveTo(-w / 2 - 20, -h * 0.6); ctx.lineTo(-w / 2 + 20, -h); ctx.lineTo(w / 2 - 20, -h); ctx.lineTo(w / 2 + 20, -h * 0.6); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(-w / 2 + 20, -h * 0.5, 50, 36);
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(10, -64, 50, 64);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('山田', 35, -70);
  },

  house_friend(ctx, w, h) {
    ctx.fillStyle = '#3d2f5c';
    ctx.fillRect(-w / 2, -h * 0.7, w, h * 0.7);
    ctx.fillStyle = '#ff8a1c';
    ctx.beginPath(); ctx.moveTo(-w / 2 - 16, -h * 0.7); ctx.lineTo(0, -h); ctx.lineTo(w / 2 + 16, -h * 0.7); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(-w / 2 + 24, -h * 0.55, 44, 36);
    ctx.fillRect(w / 2 - 68, -h * 0.55, 44, 36);
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(-30, -90, 60, 90);
    ctx.fillStyle = '#eee';
    ctx.fillRect(40, -60, 12, 18); // インターホン
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('友達の家', 0, -h - 10);
  },

  grandma(ctx, w, h) {
    ctx.fillStyle = '#8a5a8a';
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 3, -h * 0.65); ctx.lineTo(w / 3, -h * 0.65); ctx.lineTo(w / 2, 0); ctx.fill();
    ctx.fillStyle = '#f2d2b0';
    ctx.beginPath(); ctx.arc(0, -h * 0.78, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ddd';
    ctx.beginPath(); ctx.arc(0, -h * 0.9, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(-8, -h * 0.79, 5, 2); ctx.fillRect(3, -h * 0.79, 5, 2);
  },

  house_grandpa(ctx, w, h) {
    ctx.fillStyle = '#3a3a48';
    ctx.fillRect(-w / 2, -h * 0.6, w, h * 0.6);
    ctx.fillStyle = '#2a3a5a';
    ctx.beginPath(); ctx.moveTo(-w / 2 - 20, -h * 0.6); ctx.lineTo(-w / 2 + 30, -h); ctx.lineTo(w / 2 - 30, -h); ctx.lineTo(w / 2 + 20, -h * 0.6); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(w / 2 - 80, -h * 0.5, 50, 36);
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(-60, -64, 50, 64);
    // 盆栽
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(20, -16, 30, 16);
    ctx.fillStyle = '#2f5a2a'; ctx.beginPath(); ctx.ellipse(35, -26, 22, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('佐藤', -35, -70);
  },

  grandpa(ctx, w, h) {
    // 杖
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w * 0.42, 0); ctx.lineTo(w * 0.36, -h * 0.5); ctx.stroke();
    ctx.fillStyle = '#4a5a6a';
    ctx.beginPath(); ctx.moveTo(-w / 2.4, 0); ctx.lineTo(-w / 3, -h * 0.65); ctx.lineTo(w / 3, -h * 0.65); ctx.lineTo(w / 2.4, 0); ctx.fill();
    ctx.fillStyle = '#f2d2b0';
    ctx.beginPath(); ctx.arc(0, -h * 0.78, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eee'; // 横の白髪とひげ
    ctx.beginPath(); ctx.arc(-14, -h * 0.8, 6, 0, Math.PI * 2); ctx.arc(14, -h * 0.8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -h * 0.72, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(-9, -h * 0.8, 6, 2); ctx.fillRect(3, -h * 0.8, 6, 2);
  },

  friend(ctx, w, h) {
    ctx.fillStyle = '#2a5aa8';
    ctx.fillRect(-w / 3, -h * 0.65, (w * 2) / 3, h * 0.65);
    ctx.fillStyle = '#f2d2b0';
    ctx.beginPath(); ctx.arc(0, -h * 0.8, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, -h * 0.88, 18, Math.PI, 0); ctx.fill();
    Placeholder.eyes(ctx, 0, -h * 0.8, 0.6);
  },

  police(ctx, w, h) {
    ctx.fillStyle = '#1a2a6a';
    ctx.fillRect(-w / 3, -h * 0.7, (w * 2) / 3, h * 0.7);
    ctx.fillStyle = '#f2d2b0';
    ctx.beginPath(); ctx.arc(0, -h * 0.8, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a2a6a'; ctx.fillRect(-17, -h - 2, 34, 12);
    ctx.fillStyle = '#ffd700'; ctx.fillRect(-4, -h + 1, 8, 6);
  },

  cat(ctx, w, h, phase = 0) {
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.ellipse(0, -h * 0.45, w * 0.4, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.35, -h * 0.7, h * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.25, -h * 0.85); ctx.lineTo(w * 0.28, -h * 1.05); ctx.lineTo(w * 0.38, -h * 0.9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.4, -h * 0.9); ctx.lineTo(w * 0.5, -h * 1.05); ctx.lineTo(w * 0.52, -h * 0.82); ctx.fill();
    ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-w * 0.38, -h * 0.5); ctx.quadraticCurveTo(-w * 0.6, -h * 0.9, -w * 0.5, -h * 1.1); ctx.stroke();
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath(); ctx.arc(w * 0.3, -h * 0.72, 2.5, 0, Math.PI * 2); ctx.arc(w * 0.42, -h * 0.72, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3;
    const a = Math.sin(phase) * 6;
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -h * 0.2); ctx.lineTo(-w * 0.2 + a, 0);
    ctx.moveTo(w * 0.2, -h * 0.2); ctx.lineTo(w * 0.2 - a, 0);
    ctx.stroke();
  },

  candy(ctx, w, h) {
    ctx.fillStyle = '#ff4fa0';
    ctx.beginPath(); ctx.arc(0, -h / 2, h * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-h * 0.3, -h / 2); ctx.lineTo(-w / 2, -h * 0.8); ctx.lineTo(-w / 2, -h * 0.2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(h * 0.3, -h / 2); ctx.lineTo(w / 2, -h * 0.8); ctx.lineTo(w / 2, -h * 0.2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-3, -h * 0.58, 3, 0, Math.PI * 2); ctx.fill();
  },

  fence(ctx, w, h) {
    ctx.fillStyle = '#8a6a4a';
    for (let i = 0; i < 3; i++) ctx.fillRect(-w / 2 + i * (w / 3), -h, w / 3 - 3, h);
    ctx.fillRect(-w / 2 - 4, -h * 0.75, w + 8, 6);
    ctx.fillRect(-w / 2 - 4, -h * 0.35, w + 8, 6);
  },

  puddle(ctx, w, h) {
    ctx.fillStyle = 'rgba(90,140,220,0.55)';
    ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-w * 0.2, -h * 0.6, w * 0.08, h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  },

  signal(ctx, w, h, red) {
    ctx.fillStyle = '#555'; ctx.fillRect(-4, -h, 8, h);
    ctx.fillStyle = '#222'; ctx.fillRect(-w / 2, -h - 10, w, 64);
    ctx.fillStyle = red ? '#ff3030' : '#401010';
    ctx.beginPath(); ctx.arc(0, -h + 6, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = red ? '#103010' : '#30ff60';
    ctx.beginPath(); ctx.arc(0, -h + 34, 11, 0, Math.PI * 2); ctx.fill();
  },
  signal_red(ctx, w, h) { Placeholder.signal(ctx, w, h, true); },
  signal_green(ctx, w, h) { Placeholder.signal(ctx, w, h, false); },
};
