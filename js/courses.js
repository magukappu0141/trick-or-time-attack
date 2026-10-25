// =====================================================================
//  コース（難易度）
//  イージー：手作りの配置（最初に作ったコース）
//  ノーマル：セクションを並べると自動で配置される。長さはイージーの約2.5倍
//  ハード　：ノーマルと途中まで完全に同じ → cut: true のセクションから先は一直線の道（約2倍の長さ）
// =====================================================================

// --- イージー（手作り） ---
const EASY_COURSE = decorateCourse({
  id: 'easy', name: 'イージー',
  START_X: 200,
  END_X: 17600, // 友達の家のドア

  // 地形 [x, 標高]（間は直線補間）
  terrain: [
    [0, 0], [1500, 0], [2400, 120], [3000, 120], [3800, 0],
    [6600, 0], [7200, 110], [7450, 110], [7950, 0],
    [14000, 0], [14800, 90], [15100, 90], [15800, 0],
    [99999, 0],
  ],

  candies: [1150, 1250, 2700, 2760, 4600, 4700, 4800, 9400, 11600, 11650, 11700, 13000, 16200, 16300],
  fences: [4200, 9000, 13600],
  puddles: [[5100, 5700], [12000, 12700]],
  cats: [6000],
  signals: [{ x: 8000, offset: 0 }], // x = 停止線。offset で色の変わるタイミングをずらす
  grandma: 10500,
  grandpa: 12900,
  houses: [600, 1900, 3300, 4400, 5900, 8700, 9600, 11300, 12300, 13300, 15400, 16600],

  // スプリット（x を超えたら区間タイム記録。最後はトリックオアトリート成功時）
  splits: [
    { name: '最初の坂', x: 3800 },
    { name: '黒猫通り', x: 6700 },
    { name: '交差点',   x: 8400 },
    { name: 'おばあちゃん', x: 10800 },
    { name: '友達の家', x: 17560 },
    { name: 'トリックオアトリート', x: null },
  ],
});

// --- ノーマル（セクションを並べる） ---
// t: セクションの種類 / split: そのセクションの終わりで区間タイムを記録
// cut: true … ハードはここから先が一直線の道になる
const NORMAL_SECTIONS = [
  { t: 'flat', len: 900, candies: [500, 560] },
  { t: 'hill', up: 700, top: 500, down: 800, h: 110, candies: [200], split: '坂道' },
  { t: 'fence', len: 700 },
  { t: 'puddle', len: 600 },
  { t: 'cat', len: 900 },
  { t: 'flat', len: 700, candies: [200, 260, 320] },
  { t: 'signal', offset: 0, split: '1つ目の信号' },
  { t: 'stairs', n: 3 },
  { t: 'fences', n: 2, gap: 320, len: 1000 },
  { t: 'flat', len: 600 },
  { t: 'hill', up: 900, top: 300, down: 1300, h: 170, split: '大きな坂' }, // 下り坂の先に信号 → パンプキンロールで突破できる
  { t: 'signal', offset: 300, split: '2つ目の信号' },
  { t: 'cat', len: 900 },
  { t: 'puddle', len: 900 },
  { t: 'flat', len: 800, candies: [300, 350, 400, 450] },
  { t: 'valley', down: 600, bottom: 500, up: 700, depth: 100 },
  { t: 'fences', n: 3, gap: 280, len: 1300, split: '柵ゾーン' },
  { t: 'grandpa' },
  { t: 'cat', len: 1200, n: 2 },
  { t: 'flat', len: 1000, candies: [400, 700] },
  { t: 'stairs', n: 4 },
  { t: 'flat', len: 1500, candies: [700, 760] },
  { t: 'puddle', len: 1200 },
  { t: 'fence', len: 700 },
  { t: 'flat', len: 1200, split: '商店街' },
  { t: 'signal', offset: 700, split: '3つ目の信号' },
  { t: 'hill', up: 800, top: 600, down: 900, h: 130 },
  { t: 'fences', n: 2, gap: 300, len: 900 },
  { t: 'cat', len: 900 },
  { t: 'valley', down: 500, bottom: 400, up: 600, depth: 80 },
  { t: 'flat', len: 1400, candies: [300, 360, 420, 480, 540] },
  { t: 'puddle', len: 1000 },
  { t: 'grandma', split: 'おばあちゃん' },   // 猫を全部通り過ぎたあと（ハードの儀式のため）
  { t: 'stairs', n: 3 },
  { t: 'fence', len: 700 },
  { t: 'goal', len: 2700, split: '友達の家' },
];

// ハードで「普通の後半」になった時の道（儀式をしなかった場合）
const HARD_SECOND_HALF_BLOCK = [
  { t: 'flat', len: 1200, candies: [500, 560] },
  { t: 'hill', up: 900, top: 500, down: 1000, h: 150 },
  { t: 'fences', n: 3, gap: 300, len: 1300 },
  { t: 'signal', offset: 200 },
  { t: 'cat', len: 900, n: 2 },
  { t: 'stairs', n: 5 },
  { t: 'puddle', len: 1500 },
  { t: 'valley', down: 700, bottom: 600, up: 800, depth: 120 },
  { t: 'flat', len: 1500, candies: [300, 360, 420] },
  { t: 'fence', len: 800 },
  { t: 'hill', up: 1000, top: 400, down: 1400, h: 190 },
  { t: 'signal', offset: 500 },
  { t: 'fences', n: 4, gap: 260, len: 1500 },
];

function buildCourse(id, name, sections) {
  const L = {
    id, name, START_X: 200,
    terrain: [[0, 0]], candies: [], fences: [], puddles: [], cats: [], signals: [],
    grandma: -99999, grandpa: -99999, houses: [], splits: [], noHouse: [],
  };
  let x = L.START_X + 300, h = 0;
  L.terrain.push([x, 0]);
  const to = (nx, nh = h) => { x = nx; h = nh; L.terrain.push([x, h]); };

  for (const s of sections) {
    const x0 = x, h0 = h;

    switch (s.t) {
      case 'flat':
        (s.candies || []).forEach((o) => L.candies.push(x0 + o));
        to(x0 + s.len);
        break;
      case 'hill':
        to(x0 + s.up, h0 + s.h);
        (s.candies || []).forEach((o) => L.candies.push(x + o));
        to(x + s.top);
        to(x + s.down, h0);
        break;
      case 'valley':
        to(x0 + s.down, h0 - s.depth);
        to(x + s.bottom);
        to(x + s.up, h0);
        break;
      case 'stairs':
        for (let i = 0; i < s.n; i++) { to(x + 150, h0 + 45); to(x + 100); to(x + 150, h0); }
        break;
      case 'fence':
        L.fences.push(x0 + s.len / 2);
        to(x0 + s.len);
        break;
      case 'fences':
        for (let i = 0; i < s.n; i++) L.fences.push(x0 + 250 + i * s.gap);
        to(x0 + s.len);
        break;
      case 'puddle':
        L.puddles.push([x0 + 100, x0 + 100 + s.len]);
        to(x0 + s.len + 200);
        break;
      case 'cat':
        for (let i = 0; i < (s.n || 1); i++) L.cats.push(x0 + 400 + i * 380);
        to(x0 + s.len);
        break;
      case 'signal':
        L.signals.push({ x: x0 + 300, offset: s.offset || 0 });
        L.noHouse.push([x0 - 100, x0 + 800]);
        to(x0 + 900);
        break;
      case 'grandma':
        L.grandma = x0 + 400;
        L.noHouse.push([x0 - 100, x0 + 800]);
        to(x0 + 1300);
        break;
      case 'grandpa':
        L.grandpa = x0 + 400;
        L.noHouse.push([x0 - 100, x0 + 800]);
        to(x0 + 1300);
        break;
      case 'horror':
        L.horrorStart = x0;
        (s.eyes || []).forEach((o) => L.candies.push(x0 + o));
        to(x0 + s.len);
        break;
      case 'goal':
        L.END_X = x0 + s.len - 300;
        L.noHouse.push([L.END_X - 500, L.END_X + 600]);
        to(x0 + s.len);
        break;
    }
    if (s.split) L.splits.push({ name: s.split, x: s.t === 'goal' ? L.END_X - 40 : x });
    if (s.branch) L.branchX = x; // ハードの分かれ道（ここから先がホラー／普通の後半）
    (s.splits || []).forEach((sp) => L.splits.push({ name: sp.name, x: x0 + sp.at }));
  }
  L.terrain.push([x + 99999, 0]);
  L.splits.push({ name: 'トリックオアトリート', x: null });

  // 家：だいたい1100pxおき（乱数シード固定なので毎回同じ。ハードもカット地点まではノーマルと同じになる）
  const rng = mulberry32Course(4649);
  const lastHouse = L.horrorStart != null ? L.horrorStart : L.END_X - 500;
  for (let hx = L.START_X + 400; hx < lastHouse; hx += 900 + Math.floor(rng() * 500)) {
    if (L.noHouse.some(([a, b]) => hx > a && hx < b)) continue;
    L.houses.push(hx);
  }
  return decorateCourse(L);
}

// 街灯・木などの飾り（見た目だけ）
function decorateCourse(L) {
  // 乱数を分けておく（ハードとノーマルで、カット地点までの見た目が完全に同じになるように）
  const rngL = mulberry32Course(1031), rngT = mulberry32Course(2024);
  L.lamps = [];
  for (let x = L.START_X + 300; x < L.END_X + 600; x += 650 + Math.floor(rngL() * 200)) L.lamps.push(x);
  L.trees = [];
  for (let x = L.START_X; x < L.END_X + 800; x += 380 + Math.floor(rngT() * 500)) {
    const t = { x, s: 0.7 + rngT() * 0.6, seed: Math.floor(rngT() * 1000) };
    if (L.horrorStart != null && x > L.horrorStart) continue;
    L.trees.push(t);
  }
  return L;
}

// courses.js は game.js より先に読むので、ここ用の乱数
function mulberry32Course(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NORMAL_COURSE = buildCourse('normal', 'ノーマル', NORMAL_SECTIONS);

// --- ハード：前半はノーマルとまったく同じ（友達の家だけ無い）→ 分かれ道 ---
//   儀式（猫を全部3回なでる → おばあちゃんの家で kill）をした → 一直線のホラーの道（HARD_HORROR）
//   しなかった → 普通の後半コース（HARD_COURSE）
const HARD_COURSE = (() => {
  const goal = NORMAL_SECTIONS[NORMAL_SECTIONS.length - 1];
  const firstHalf = NORMAL_SECTIONS.slice(0, -1).concat([{ t: 'flat', len: goal.len, branch: true }]);
  const target = NORMAL_COURSE.START_X + (NORMAL_COURSE.END_X - NORMAL_COURSE.START_X) * 2; // ノーマルの2倍
  const goalLen = 1500;
  // 普通の後半：ブロックを繰り返して長さを合わせる
  const half = [];
  const branchX = buildCourse('tmp', '', firstHalf).branchX;
  let len = 0;
  const secLen = (s) => ({ flat: s.len, hill: (s.up || 0) + (s.top || 0) + (s.down || 0), valley: (s.down || 0) + (s.bottom || 0) + (s.up || 0), stairs: (s.n || 0) * 400, fence: s.len, fences: s.len, puddle: (s.len || 0) + 200, cat: s.len, signal: 900 }[s.t]);
  const room = target - branchX - goalLen + 300;
  for (let rep = 0; len < room - 16000; rep++) for (const s of HARD_SECOND_HALF_BLOCK) { half.push({ ...s }); len += secLen(s); }
  half[Math.floor(half.length / 3)].split = '後半戦';
  half[Math.floor((half.length * 2) / 3)].split = '最後の坂';
  half.push({ t: 'flat', len: room - len });
  half.push({ t: 'goal', len: goalLen, split: '友達の家' });
  const normalHalf = buildCourse('hard', 'ハード', firstHalf.concat(half));

  // ホラーの後半（長さ・スプリットの数を普通の後半とそろえる）
  const roadLen = normalHalf.END_X - branchX - goalLen + 300;
  const eyes = [];
  for (let o = 3000; o < roadLen - 3000; o += 5200) eyes.push(o, o + 60);
  const horror = buildCourse('hard', 'ハード', firstHalf.concat([
    { t: 'horror', len: roadLen, eyes, splits: [{ name: '？？？', at: Math.round(roadLen / 3) }, { name: '？？？', at: Math.round((roadLen * 2) / 3) }] },
    { t: 'goal', len: goalLen, split: 'ともだちのいえ' },
  ]));
  normalHalf.horrorVariant = horror;
  return normalHalf;
})();
const HARD_HORROR = HARD_COURSE.horrorVariant;

// 電柱（掲示板つき）13本：ノーマルとハードの前半で同じ位置
const POLE_RANGE = [1700, NORMAL_COURSE.END_X - 1500];
[NORMAL_COURSE, HARD_COURSE, HARD_HORROR].forEach((L) => addPoles(L, POLE_RANGE[0], POLE_RANGE[1], 13));

function addPoles(L, from, to, n) {
  const busy = (x) => L.signals.some((s) => Math.abs(s.x + 150 - x) < 550) || Math.abs(L.grandma + 100 - x) < 700 || Math.abs(L.grandpa + 100 - x) < 700 || L.fences.some((f) => Math.abs(f - x) < 120);
  L.poles = [];
  for (let i = 0; i < n; i++) {
    let x = from + ((to - from) * i) / (n - 1);
    while (busy(x)) x += 250;
    L.poles.push({ x, kind: i % 6 });
  }
}

const COURSES = [EASY_COURSE, NORMAL_COURSE, HARD_COURSE];
let LEVEL = EASY_COURSE;
