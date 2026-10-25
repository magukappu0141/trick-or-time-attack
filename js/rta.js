// =====================================================================
//  無駄に本格的なRTA機能：スプリット / PB / 金区間 / Sum of Best / ゴースト
// =====================================================================
const STORAGE_PREFIX = 'trick_or_time_attack_v1_';

const RTA = {
  load(category) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + category);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { attempts: 0, completed: 0, pb: null, golds: LEVEL.splits.map(() => null), ghost: null };
  },

  save(category, data) {
    try { localStorage.setItem(STORAGE_PREFIX + category, JSON.stringify(data)); } catch (_) {}
  },

  sumOfBest(data) {
    if (data.golds.some((g) => g == null)) return null;
    return data.golds.reduce((a, b) => a + b, 0);
  },

  // フレーム数 → "1:23.45"
  fmt(frames, sign = false) {
    if (frames == null) return '-';
    const neg = frames < 0;
    const t = Math.abs(frames) / CONFIG.FPS;
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    let str = m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
    if (sign) str = (neg ? '−' : '+') + str;
    return str;
  },
};

// ゴースト：2フレームごとに [x, y, 傾き*100, 状態] を記録
class GhostRecorder {
  constructor() { this.frames = []; }
  record(frame, p) {
    if (frame % 2) return;
    this.frames.push([Math.round(p.x), Math.round(p.y), Math.round(p.lean * 100), p.fallen ? 1 : 0, G.headless ? 1 : 0]);
  }
}

function ghostAt(ghost, frame) {
  if (!ghost || !ghost.length) return null;
  const i = Math.min(ghost.length - 1, Math.floor(frame / 2));
  const g = ghost[i];
  return { x: g[0], y: g[1], lean: g[2] / 100, fallen: !!g[3], headless: !!g[4] };
}
