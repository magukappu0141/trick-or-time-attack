// =====================================================================
//  音声認識 + 声量メーター（ゴールで本当に「トリックオアトリート」と叫ぶ）
// =====================================================================
const VOICE_THRESHOLD_KEY = 'trick_or_time_attack_voice_threshold';

const VOICE_ERRORS = {
  'not-allowed': 'マイクが許可されていません（アドレスバーのマイク許可を確認）',
  'service-not-allowed': '音声認識が許可されていません（file:// ではなく http://localhost で開く）',
  'audio-capture': 'マイクが見つかりません（接続・OSのマイク許可を確認）',
  'network': '音声認識サーバーにつながりません（ネット接続を確認）',
  'no-speech': '声が聞こえません（もっと近くで）',
  'aborted': '音声認識が中断されました',
  'language-not-supported': '日本語の音声認識に対応していません',
};

const Voice = {
  SR: window.SpeechRecognition || window.webkitSpeechRecognition || null,
  rec: null,
  active: false,
  listening: false,   // 認識エンジンが動いているか
  pending: false,     // start() したが、まだ onstart が来ていない
  sessions: 0,        // 何回認識を始め直したか
  log: [],            // マイクテストに出すイベント履歴
  interim: '',
  lastFinal: '',
  level: 0,           // 現在の声量 0〜1
  levels: [],         // 直近3秒ぶんの声量（「言っている間」の最大声量に使う）
  noiseFloor: 0.01,   // 周りの雑音レベル（自動で測る）
  hasMic: false,
  micError: null,
  lastError: null,
  stream: null,
  analyser: null,
  onResult: null,
  onShout: null,      // 叫び判定（声の大きさと長さだけ）で合格した時に呼ぶ
  threshold: CONFIG.VOICE_LOUD_THRESHOLD,
  srFails: 0,         // 音声認識が続けて失敗した回数（Brave などはずっと network エラーになる）
  lastResultAt: 0,    // 音声認識が最後に何か返した時刻
  seg: null,          // 今しゃべっている声のかたまり
  shoutCheck: null,   // 叫び終わった声：音声認識が何か返すか少し待ってから判定する

  get supported() { return !!this.SR; },

  // 音声認識が使えないブラウザ・環境（このときは叫び判定だけで判定する）
  get srDead() { return !this.SR || this.srFails >= 3 || ['service-not-allowed', 'language-not-supported'].includes(this.lastError); },

  loadThreshold() {
    try {
      const v = parseFloat(localStorage.getItem(VOICE_THRESHOLD_KEY));
      if (v > 0) this.threshold = v;
    } catch (_) {}
  },
  saveThreshold() {
    try { localStorage.setItem(VOICE_THRESHOLD_KEY, String(this.threshold)); } catch (_) {}
  },

  // 叫んだと判定する声量。雑音が大きい場所では自動で上げる
  get loudLine() { return Math.max(this.threshold, this.noiseFloor * 4); },

  // 直近3秒の最大声量
  get recentPeak() { return this.levels.length ? Math.max(...this.levels) : 0; },

  // onResult(alts, isFinal) … 途中結果でも呼ぶ（合っていれば即クリアにできる）
  async start(onResult, onShout = null) {
    this.onResult = onResult;
    this.onShout = onShout;
    this.srFails = 0;
    this.seg = null;
    this.shoutCheck = null;
    this.active = true;
    this.interim = '';
    this.lastFinal = '';
    this.lastError = null;
    this.levels = [];
    this.sessions = 0;
    this.log = [];
    this.t0 = performance.now();
    this.ready = false; // マイクの準備が終わるまで見張りは動かさない
    await this.startMeter();
    if (!this.SR || !this.active) return;
    this.ready = true;
    this.startSession();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.watchdog(), 200);
  },

  logEvent(str) {
    this.log.push(`${((performance.now() - this.t0) / 1000).toFixed(1)}s ${str}`);
    if (this.log.length > 8) this.log.shift();
  },

  // 認識セッションを1つ始める。毎回新しい認識オブジェクトを作る
  // （同じオブジェクトを再利用すると、2回目以降に黙って動かなくなるブラウザがある）
  startSession() {
    if (this.rec) { const old = this.rec; this.rec = null; old.onend = old.onresult = old.onerror = old.onstart = null; try { old.abort(); } catch (_) {} }
    this.listening = false;
    const r = new this.SR();
    r.lang = 'ja-JP';
    // Safari は continuous だと結果が返らないことがあるので1回ずつ。Chrome は聞き続けるモード
    r.continuous = !/Apple/.test(navigator.vendor);
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.onstart = () => { if (this.rec !== r) return; this.listening = true; this.pending = false; this.logEvent('聞き取り開始'); };
    r.onresult = (e) => {
      if (this.rec !== r) return;
      this.lastError = null;
      this.srFails = 0;
      this.lastResultAt = performance.now();
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        // 候補を全部見る（第1候補が外れでも第3候補が合ってることがある）
        const alts = Array.from(res).map((a) => a.transcript);
        if (res.isFinal) { this.lastFinal = alts[0]; this.interim = ''; this.logEvent(`確定「${alts[0]}」`); }
        else this.interim = alts[0];
        if (this.onResult) this.onResult(alts, res.isFinal);
      }
    };
    r.onerror = (e) => {
      if (this.rec !== r) return;
      this.logEvent(`エラー ${e.error}`);
      if (e.error !== 'no-speech' && e.error !== 'aborted') this.lastError = e.error;
      if (e.error === 'network' || e.error === 'language-not-supported') this.srFails++;
    };
    r.onend = () => {
      if (this.rec !== r) return;
      this.listening = false; this.pending = false;
      this.lastEnd = performance.now();
      this.logEvent('終了 → 再開');
      // すぐ聞き直す（止まっている間に叫ばれると聞き逃すので、見張りを待たない）
      setTimeout(() => this.watchdog(), 60);
    };
    this.rec = r;
    this.pending = true;
    this.pendingSince = performance.now();
    this.sessions++;
    try {
      r.start();
    } catch (err) {
      this.pending = false;
      this.lastEnd = performance.now();
      this.logEvent(`開始失敗 ${err.name}`);
    }
  },

  // 見張り：止まっていたら再開する（onend が来ない・start が黙って失敗する場合にも効く）
  watchdog() {
    if (!this.active || !this.ready || this.srDead || this.lastError === 'not-allowed') return;
    const now = performance.now();
    if (this.listening) return;
    if (this.pending && now - this.pendingSince < 3000) return;
    if (now - (this.lastEnd || 0) < 50) return;
    this.startSession();
  },

  stop() {
    clearInterval(this.timer);
    this.active = false;
    this.ready = false;
    this.listening = false;
    this.pending = false;
    if (this.rec) { const r = this.rec; this.rec = null; r.onend = r.onresult = r.onerror = r.onstart = null; try { r.abort(); } catch (_) {} }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this.analyser = null;
    this.hasMic = false;
  },

  async startMeter() {
    if (this.stream) return;
    this.micError = null;
    try {
      // 自動音量調整を切る（オンだと叫んでも音量が抑えられて判定できない）
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      Sound.unlock();
      const src = Sound.ctx.createMediaStreamSource(this.stream);
      this.analyser = Sound.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      src.connect(this.analyser);
      // ブラウザによっては出力先につながっていないと解析が止まるので、無音でつないでおく
      const mute = Sound.ctx.createGain();
      mute.gain.value = 0;
      this.analyser.connect(mute);
      mute.connect(Sound.ctx.destination);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.hasMic = true;
    } catch (e) {
      this.hasMic = false;
      this.micError = e && e.name;
    }
  },

  // 毎フレーム呼ぶ
  update() {
    if (!this.analyser) { this.level *= 0.9; return; }
    if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    this.level = Math.max(rms, this.level * 0.85);
    this.levels.push(rms);
    if (this.levels.length > 180) this.levels.shift();
    // 雑音レベル：静かなときに素早く下がり、うるさいときはゆっくり上がる
    if (rms < this.noiseFloor) this.noiseFloor = this.noiseFloor * 0.9 + rms * 0.1;
    else this.noiseFloor += (rms - this.noiseFloor) * 0.002;
    this.detectShout(rms);
  },

  // ===== 叫び判定（声の大きさと長さだけ） =====
  // 音声認識が何も返さなかった叫びは、これで判定する。
  // ・Brave など音声認識が使えないブラウザ ・Edge など黙って何も返さないブラウザ
  // ・Chrome で認識が止まって再開するまでの隙間に叫んだとき
  detectShout(rms) {
    if (!this.onShout || !this.active) return;
    const now = performance.now();
    const voiced = rms >= Math.max(this.noiseFloor * 3, this.loudLine * 0.35);
    if (voiced) {
      if (!this.seg) this.seg = { start: now, env: [], quiet: 0 };
      this.seg.quiet = 0;
    }
    if (this.seg) {
      this.seg.env.push(rms);
      if (!voiced && ++this.seg.quiet > 15) { // 0.25秒黙ったら、ひとかたまり終わり
        const seg = this.seg; this.seg = null;
        seg.env.length -= seg.quiet;
        if (this.looksLikeShout(seg.env)) this.shoutCheck = { start: seg.start, end: now };
      }
    }
    const sc = this.shoutCheck;
    if (sc && (this.srDead || now - sc.end > CONFIG.SHOUT_WAIT_MS)) {
      this.shoutCheck = null;
      // 叫んでいる間〜少しあとに音声認識が何か返していたら、そっちの判定にまかせる
      if (!this.srDead && this.lastResultAt > sc.start - 300) return;
      this.logEvent('叫び判定で合格');
      if (this.SR && !this.srDead) this.startSession(); // 聞き逃した認識は、たぶん止まっているので始め直す
      this.onShout();
    }
  },

  // 長さ・大きさ・途切れ（「ト・リッ・ク・オア・ト・リー・ト」の音の切れ目）で判定する
  looksLikeShout(env) {
    const sec = env.length / CONFIG.FPS;
    const peak = Math.max(...env);
    if (sec < CONFIG.SHOUT_MIN_SEC || sec > CONFIG.SHOUT_MAX_SEC || peak < this.loudLine) return false;
    let dips = 0, high = false;
    for (let i = 1; i < env.length - 1; i++) {
      const v = (env[i - 1] + env[i] + env[i + 1]) / 3;
      if (v >= peak * 0.55) high = true;
      else if (high && v <= peak * 0.3) { dips++; high = false; }
    }
    return dips >= CONFIG.SHOUT_MIN_DIPS;
  },

  // 状態を人間向けの文章に
  statusText() {
    if (!this.hasMic && this.micError) return '× マイクが使えません（' + this.micError + '）';
    if (!this.SR) return '△ このブラウザは音声認識に非対応 → 声の大きさと長さで判定します';
    if (this.srDead) return '△ 音声認識が使えません（' + (VOICE_ERRORS[this.lastError] || this.lastError || '応答なし') + '）→ 声の大きさと長さで判定します';
    if (location.protocol === 'file:') return '△ file:// で開いています。http://localhost で開くと安定します';
    if (this.lastError) return '× ' + (VOICE_ERRORS[this.lastError] || this.lastError);
    if (this.micError) return '△ 声量メーターが使えません（' + this.micError + '）。声量判定なしで続行';
    if (this.listening) return `◯ 聞き取り中…（${this.sessions}回目）`;
    return '… 準備中';
  },
};
Voice.loadThreshold();

// ひらがな→カタカナ、記号・空白・長音を除去
function normalizeKana(s) {
  return s
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s、。！？!?・ー〜~\-.,「」]/g, '')
    .toLowerCase();
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// 「トリックオアトリート」っぽければOK（聞き間違いを2〜3文字まで許す）
const TRICK_TARGETS = ['トリックオアトリト', 'trickortreat'];
function isTrickOrTreat(text) {
  const n = normalizeKana(text);
  if (!n) return false;
  for (const t of TRICK_TARGETS) {
    if (n.includes(t)) return true;
    const tol = t.length >= 10 ? 3 : 2;
    // 前後に余計な言葉がついていても見つけられるように、部分文字列ごとに比べる
    for (let len = t.length - 2; len <= t.length + 2; len++) {
      for (let i = 0; i + len <= n.length; i++) {
        if (editDistance(n.slice(i, i + len), t) <= tol) return true;
      }
    }
    if (n.length < t.length - 2 && editDistance(n, t) <= tol) return true;
  }
  return false;
}
