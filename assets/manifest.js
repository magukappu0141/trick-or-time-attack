// =====================================================================
//  素材マニフェスト
//  ここに書いたパスにファイルを置くだけで差し替わります。
//  ファイルが無い（読み込み失敗）ときは自動で「仮素材」が使われます。
//  別のファイル名にしたい場合はパスを書き換えてください。
// =====================================================================
window.ASSET_MANIFEST = {
  images: {
    // --- プレイヤー（足元が画像の下端中央になるように描画されます） ---
    player_ghost:   'assets/img/player_ghost.png',    // おばけ
    player_pumpkin: 'assets/img/player_pumpkin.png',  // かぼちゃ
    player_pumpkin_headless: 'assets/img/player_pumpkin_headless.png', // 頭を採集されたかぼちゃ
    pumpkin_head:   'assets/img/pumpkin_head.png',    // 採集された頭（おばあちゃんが抱える／転がるときもこれ）
    player_vampire: 'assets/img/player_vampire.png',  // ドラキュラ

    // --- 背景 ---
    bg_sky:         'assets/img/bg_sky.png',          // 空（画面全体に固定表示）
    house:          'assets/img/house.png',           // 道沿いの家
    house_grandma:  'assets/img/house_grandma.png',   // おばあちゃんの家
    house_grandpa:  'assets/img/house_grandpa.png',   // おじいちゃんの家
    house_friend:   'assets/img/house_friend.png',    // 友達の家（ゴール）

    // --- キャラ・障害物 ---
    grandma:        'assets/img/grandma.png',
    grandpa:        'assets/img/grandpa.png',         // おじいちゃん（会話画面でも大きく使う）
    friend:         'assets/img/friend.png',
    police:         'assets/img/police.png',
    cat:            'assets/img/cat.png',
    candy:          'assets/img/candy.png',
    fence:          'assets/img/fence.png',
    puddle:         'assets/img/puddle.png',
    signal_red:     'assets/img/signal_red.png',
    signal_green:   'assets/img/signal_green.png',

    // --- 景色（横にループする帯は、左右の端がつながる絵にする） ---
    bg_mountains:   'assets/img/bg_mountains.png',    // 遠くの山（横長ループ）
    bg_town:        'assets/img/bg_town.png',         // 遠くの街並み（横長ループ）
    bg_trees:       'assets/img/bg_trees.png',        // 中くらいの距離の木（横長ループ）
    tree:           'assets/img/tree.png',            // 道ぞいの枯れ木
    streetlamp:     'assets/img/streetlamp.png',      // 街灯（光は自動で描く）
    deco_pumpkin:   'assets/img/deco_pumpkin.png',    // 玄関のジャック・オ・ランタン
    cloud:          'assets/img/cloud.png',
    bat:            'assets/img/bat.png',
    leaf:           'assets/img/leaf.png',            // 落ち葉

    // --- 電柱と掲示板 ---
    pole:           'assets/img/pole.png',            // 電柱（13本）
    board:          'assets/img/board.png',           // 電柱に貼ってある掲示板の紙（小さい）
    board_closeup:  'assets/img/board_closeup.png',   // ヒントの掲示板をクリックした時のアップ（血の文字は自動で描く）

    // --- ハードモードのホラー ---
    grandma_headless:    'assets/img/grandma_headless.png',    // 首が飛んだおばあちゃん
    grandma_head:        'assets/img/grandma_head.png',        // 飛んでいく首
    horror_house:        'assets/img/horror_house.png',        // ずっと繰り返す同じ家
    horror_house_friend: 'assets/img/horror_house_friend.png', // 変わり果てた友達の家
    horror_friend:       'assets/img/horror_friend.png',       // 遠くに立っている「ともだち」
    horror_follower:     'assets/img/horror_follower.png',     // うしろから来る「なにか」
    horror_jumpscare:    'assets/img/horror_jumpscare.gif',    // ジャンプスケア（全画面GIF・1回再生。長さは config の JUMPSCARE_MS）
    horror_face:         'assets/img/horror_face.png',         // GIFが無い時のびっくり顔（全画面）
    horror_moon:         'assets/img/horror_moon.png',         // 目玉の月
    horror_eye_candy:    'assets/img/horror_eye_candy.png',    // 道に落ちている目玉

    // --- UI ---
    title_logo:     'assets/img/title_logo.png',
  },

  sounds: {
    // --- SE ---
    se_step:     'assets/sound/se_step.mp3',      // 一歩
    se_stumble:  'assets/sound/se_stumble.mp3',   // つまずき
    se_fall:     'assets/sound/se_fall.mp3',      // 転倒
    se_jump:     'assets/sound/se_jump.mp3',
    se_candy:    'assets/sound/se_candy.mp3',     // お菓子を拾った（重くなる）
    se_cat:      'assets/sound/se_cat.mp3',       // 黒猫
    se_whistle:  'assets/sound/se_whistle.mp3',   // おまわりさんの笛
    se_talk:     'assets/sound/se_talk.mp3',      // おばあちゃんの文字送り
    se_doorbell: 'assets/sound/se_doorbell.mp3',  // インターホン
    se_wrong:    'assets/sound/se_wrong.mp3',     // 合言葉ちがう
    se_clear:    'assets/sound/se_clear.mp3',     // クリア
    se_split:    'assets/sound/se_split.mp3',     // スプリット通過
    se_select:   'assets/sound/se_select.mp3',    // メニュー

    // --- ハードモードのホラー ---
    se_scream:    'assets/sound/se_scream.mp3',    // ジャンプスケアの音
    se_heartbeat: 'assets/sound/se_heartbeat.mp3', // 心臓の音
    se_static:    'assets/sound/se_static.mp3',    // ザーッというノイズ
    se_sandstorm: 'assets/sound/se_sandstorm.mp3', // ジャンプスケアのあとの砂嵐
    se_splat:     'assets/sound/se_splat.mp3',     // おばあちゃんの首が飛ぶ
    se_purr:      'assets/sound/se_purr.mp3',      // 黒猫をなでた（ゴロゴロ）
    se_shout:     'assets/sound/se_shout.mp3',     // おじいちゃんの「反省しろ！！」
    se_whisper:   'assets/sound/se_whisper.mp3',   // ささやき声
    se_glitch:    'assets/sound/se_glitch.mp3',    // 画面がバグる音

    // --- BGM（ループ再生） ---
    bgm_title:   'assets/sound/bgm_title.mp3',
    bgm_game:    'assets/sound/bgm_game.mp3',
    bgm_result:  'assets/sound/bgm_result.mp3',
    bgm_horror:  'assets/sound/bgm_horror.mp3',   // ハードの一直線の道（不気味な持続音）
  },

  videos: {
    // ジャンプスケア（全画面・音つき）。無ければ images の horror_jumpscare（GIF）を使う
    // 長さを変えたら config の JUMPSCARE_MS も合わせる
    horror_jumpscare: 'assets/video/horror_jumpscare.mp4',
  },
};
