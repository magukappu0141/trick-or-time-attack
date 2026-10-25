# 🎃 トリック・オア・タイムアタック

仮装して遠くの友達の家までお菓子をもらいに行く **RTA（タイムアタック）クソゲー**。
中身はくだらないのに、RTA機能（スプリット・PBゴースト・IGT・乱数固定…）だけ無駄に本格的。

- アイデア・発表の流れ → [IDEAS.md](IDEAS.md)
- 素材の差し替え方法 → [ASSETS.md](ASSETS.md)
- バランス・ステージ配置の調整 → [js/config.js](js/config.js)

## 起動

```bash
cd ~/ハロウィンハッカソン && python3 tools/serve.py
```

ブラウザ（**Chrome 推奨**）で http://localhost:8765 を開く。

- ゴールの音声認識は Chrome / Edge / Safari の Web Speech API を使います（Chrome はネット接続が必要）
- 音声認識が何も返さなかった叫び（Brave・Edge など音声認識が動かないブラウザ、Chrome で認識が途切れた瞬間）は、**声の大きさと長さ**で判定します（`js/config.js` の `SHOUT_〜`）
- マイク自体が使えないときは自動でタイピングモードになります（ゴールで T キーでも切り替え可）
- `index.html` をダブルクリックでも遊べますが、マイク許可が毎回聞かれることがあるのでサーバー起動がおすすめ
- ホラー用のフォントは Google Fonts から読み込みます（ネットが無いと普通のフォントになります）
- タイトルで **X → Y** を押すと、記録（全コース・全仮装のPB・ゴースト・試行回数）とハードクリアの「目玉の月」が消えます

## ファイル構成

```
index.html
assets/manifest.js   素材ファイルのパス一覧（ここに書いた場所に置けば差し替わる）
assets/img/          画像を置く
assets/sound/        SE・BGMを置く
assets/video/        ジャンプスケアの動画
js/config.js         数値調整・仮装・フォント
js/texts.js          画面に出る文字・セリフ（ここだけ直せば変わる）
js/courses.js        コース（イージー／ノーマル／ハード）の配置
js/game.js           ゲーム本体（物理・ギミック・描画）
js/rta.js            スプリット / PB / 金区間 / ゴースト保存
js/voice.js          音声認識・声量メーター
js/scenery.js        背景・景色（山・街並み・木・街灯・霧・落ち葉）
js/horror.js         ハードモードのホラー演出
js/audio.js          サウンド（無い音はシンセで代用）
js/assets.js         画像ローダーと仮素材の描画
```

記録は localStorage に保存されます。消したいときはブラウザの開発者ツールで `localStorage.clear()`。

## クレジット

- BGM：魔王魂（https://maou.audio/）
