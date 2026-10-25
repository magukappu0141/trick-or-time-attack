// =====================================================================
//  ゲームバランス・ステージ配置（ここの数字をいじれば調整できます）
//  距離の単位は px。表示上は 1px = 0.1m として扱っています。
// =====================================================================
const CONFIG = {
  WIDTH: 1280,
  HEIGHT: 720,
  GROUND_Y: 560,          // 標高0の地面の高さ（画面座標）
  PX_PER_METER: 10,
  FPS: 60,
  RNG_SEED: 20261031,     // 乱数シード固定（＝乱数調整が理論上できる）

  GRAVITY: 0.45,
  GROUND_FRICTION: 0.99,
  IDLE_FRICTION: 0.92,    // A/Dを離して IDLE_FRAMES たつとブレーキ（信号の前で止まれる）
  IDLE_FRAMES: 24,        // ゆっくり歩く人（1秒に2.5歩）にはブレーキがかからない長さ
  AIR_DRAG: 0.998,

  // バランス（倒立振子＋体幹）
  // 少し傾くくらいなら「体幹」で自然に戻る。体幹の限界を超えると倒れ始めるので ←→ で踏ん張る
  LEAN_GRAVITY: 0.0025,   // 傾いた方向に倒れようとする力（×頭の重さ）
  LEAN_SPRING: 0.005,     // 体幹：まっすぐに戻ろうとする力
  LEAN_SPRING_LIMIT: 0.4, // 体幹が効く傾きの限界（rad）。これを超えると戻す力が増えなくなる
  LEAN_DAMPING: 0.94,
  LEAN_INPUT: 0.0035,     // ←→で踏ん張る力
  STEP_LEAN_PUSH: 0.003,  // 一歩ごとに前に傾く量
  FALL_ANGLE: 1.0,        // これ以上傾くと転倒（rad）
  DANGER_ANGLE: 0.5,      // これ以上傾くと「あぶない！」表示
  STUMBLE_KICK: 0.02,     // 同じ足を2回出したときによろける量
  HEM_KICK: 0.04,         // おばけが裾を踏んだときによろける量
  SLIP_KICK: 0.03,        // 水たまりで滑ったときによろける量
  SLIP_CHANCE: 0.25,      // 水たまりで滑る確率
  CANDY_WEIGHT: 0.12,     // お菓子1個あたり頭が重くなる量
  CANDY_WEIGHT_MAX: 8,
  CANDY_BOOST_FRAMES: 100,  // お菓子を拾うと、この間だけダッシュ（60で1秒）
  CANDY_BOOST_POWER: 1.6,   // ダッシュ中の一歩の強さ（倍）
  CANDY_BOOST_SPEED: 1.5,   // ダッシュ中の最高速（倍）
  CANDY_BOOST_KICK: 1.5,    // 拾った瞬間に前に押される速さ    // 何個目まで重くなるか（長いコースで拾いすぎて詰まないように）

  GETUP_MIN_FRAMES: 25,   // 転倒してから起き上がれるまで（Space / A / D で起き上がる）
  GETUP_AUTO_FRAMES: 90,  // 自動で起き上がるまで（かぼちゃは自動で起きない）

  FENCE_H: 50,           // 柵の高さ
  FENCE_HALF: 22,        // 柵の当たり判定の半分の幅
  FENCE_KNOCKBACK: 32,   // 柵にぶつかったら少し後ろに戻す（その場でジャンプし直せる距離）
  JUMP_MIN_VX: 3.5,      // ジャンプすると最低でもこの速度で前に跳ぶ（止まっていても柵を越えられる）
  INVERT_FRAMES: 300,     // 黒猫の操作反転
  SIGNAL_RED: 720,        // 赤信号の長さ（フレーム）= 12秒
  SIGNAL_GREEN: 360,      // 青信号の長さ = 6秒（最後の2秒は点滅）
  POLICE_WARP_BACK: 1000, // 信号無視で戻される距離（px）= 100m
  POLICE_SPEED_EXEMPT: 9, // これより速いとおまわりさんに見えない
  POLICE_HEIGHT_EXEMPT: 110, // これより高いとおまわりさんの視界に入らない

  // おばあちゃんの話す速さ：1フレームに進む文字数。1行ごとに GRANDMA_SPEED_UP ずつ速くなる（だんだん早口）
  GRANDMA_SPEED_START: 0.075,  // 1回の話が1分〜1分15秒くらいになる速さ
  GRANDMA_SPEED_UP: 0.035,
  GRANDMA_LINE_WAIT: 60,       // 1行言い終わってから次の行までの待ち（行ごとに4ずつ短くなる）
  GRANDMA_LINE_WAIT_MIN: 10,

  // スキップボタンAI
  SKIP_SHOW_PREDICTION: false, // true にするとカーソル予測の線を表示
  SKIP_FLEE_RANGE: 260,     // カーソルがこの距離まで来たら逃げる
  SKIP_PREDICT_FRAMES: 10,  // カーソルの何フレーム先を予測して逃げるか
  SKIP_STAMINA_DRAIN: 0.08, // 逃げるたびに減るスタミナ（0で力尽きる）
  SKIP_DASH_RANGE: 85,      // カーソルがここまで来たら横っ飛びで回避
  SKIP_DASH_POWER: 24,
  SKIP_DASH_COOLDOWN: 16,
  SKIP_DASH_COST: 8,        // 横っ飛び1回で使うスタミナ
  SKIP_STAMINA_REGEN: 0.25, // 追われていない間の回復
  SKIP_EXHAUST_FRAMES: 120, // 力尽きて寝ている時間（このあいだはクリックし放題）
  SKIP_DECOY_AFTER: 300,    // 分身の術を使うまでのフレーム（空振り2回でも発動）

  JUMPSCARE_MS: 5000,          // ジャンプスケア動画（GIF）の長さ。差し替えたら合わせる
  JUMPSCARE_VOLUME: 4,         // ジャンプスケア音の増幅（1 = そのまま。上げるほど音が割れて大きくなる）
  HORROR_SILENT_AT: 0.7,       // ホラーの道をこの割合まで進むと、ジャンプスケア以外の音（SE・BGM）が全部消える
  SANDSTORM_MS: 1000,          // ジャンプスケアのあとの砂嵐の長さ（エンディング）
  SANDSTORM_CAUGHT_MS: 450,    // 「なにか」に捕まった時の砂嵐の長さ
  VOICE_LOUD_THRESHOLD: 0.05, // 叫び判定の声量の初期値（タイトルで V → マイクテストで↑↓調整・保存できる）
  // 叫び判定（音声認識が何も返さなかった時・使えないブラウザで、声の大きさと長さだけで判定する）
  SHOUT_MIN_SEC: 0.6,          // これより短い声は叫びとみなさない
  SHOUT_MAX_SEC: 4,            // これより長い声も叫びとみなさない
  SHOUT_MIN_DIPS: 1,           // 声の途切れ（「トリッ・ク」の切れ目）がいくつ以上あるか（「わーー」だけの叫びを弾く）
  SHOUT_WAIT_MS: 1500,         // 叫び終わってから、音声認識の結果をどれだけ待つか
  TYPING_EXCLAMATIONS: 5,     // タイピングモードで必要な「！」の数
};

// 仮装 = RTAカテゴリ
const COSTUMES = [
  {
    id: 'ghost', name: 'おばけ', category: 'おばけ%',
    desc: 'スピード型。軽くて足が速い。\nShift を押している間は\n柵と黒猫をすり抜ける。',
    stepPower: 1.9, maxSpeed: 8.5, headMass: 0.6, jumpV: 9,
    spring: 1.5,            // 体幹の強さ（倍）
    hemLimit: 5, hemKick: 0.015, // この間隔（フレーム）より速く歩くと裾を踏む / その時のよろけ
    phase: true,            // Shift ですり抜け
    grandmaGuess: 'てるてる坊主',
  },
  {
    id: 'pumpkin', name: 'かぼちゃ', category: 'かぼちゃ%',
    desc: '頭が重すぎて、すぐ転ぶ。\nでも転ぶとゴロゴロ転がって速い。\n【技】パンプキンロール\n※おばあちゃんの前では転がるな',
    stepPower: 1.3, maxSpeed: 5.6, headMass: 1.9, jumpV: 8.5,
    rollWhenFallen: true, grandmaGuess: 'みかん',
    // おばあちゃんの前を転がって通ると頭を採集される → この値で上書き（ほぼおばけと同じ）
    headless: { name: 'かぼちゃ（頭なし）', stepPower: 1.4, maxSpeed: 6.0, headMass: 0.8, jumpV: 9, rollWhenFallen: false },
  },
  {
    id: 'vampire', name: 'ドラキュラ', category: 'ドラキュラ%',
    desc: 'いちばん普通。\nSpace長押しでマントで滑空できる。\n【技】高度スキップ',
    stepPower: 1.4, maxSpeed: 6.0, headMass: 1.1, jumpV: 10.5,
    glide: true, grandmaGuess: '執事さん',
  },
];

// ステージ配置は js/courses.js（難易度ごと）

// 画面に出るセリフ・メッセージは js/texts.js にまとめてあります

// ---------------------------------------------------------------------
//  フォント（怖さを出すものは index.html で Google Fonts から読み込む。ネットが無いと後ろの普通のフォントになる）
// ---------------------------------------------------------------------
const FONTS = {
  ui: '"Hiragino Sans", "Noto Sans JP", sans-serif',
  horror: '"Yuji Boku", "Hiragino Mincho ProN", "Yu Mincho", serif', // 筆で書いたような不気味な字（ホラーのセリフ）
  kid: '"Hachi Maru Pop", "Hiragino Maru Gothic ProN", sans-serif',  // 子どもの丸文字（「ともだち」の声）
  glitch: '"DotGothic16", "Osaka-Mono", monospace',                   // ホラー終盤の壊れた画面（HUD全部）
  blood: '"Creepster", "Chalkduster", cursive',                       // 掲示板の血文字
  // ホラーの道の落書き「Got ist tott!!」は、これを順番に使う
  graffiti: ['"UnifrakturMaguntia", serif', '"Nosifer", cursive', '"Rock Salt", cursive', '"Creepster", cursive', '"Special Elite", monospace',
    '"Eater", cursive', '"Permanent Marker", cursive', '"Butcherman", cursive', '"Rubik Wet Paint", cursive', '"Pirata One", serif',
    '"Rubik Glitch", sans-serif', '"Jolly Lodger", cursive'],
};
