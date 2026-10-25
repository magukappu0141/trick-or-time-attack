# tools

## jumpscare_maker.html
ハードモードのジャンプスケアGIF（`assets/img/horror_jumpscare.gif`）の元になる絵を描くページ。
`http://localhost:8765/tools/jumpscare_maker.html` を開くと再生される（クリックでもう一度）。

GIFに作り直すときは、全30フレームをPNGで書き出して ffmpeg でまとめる:

```bash
ffmpeg -framerate 25 -i frames/f%03d.png -vf "scale=640:-1:flags=lanczos,hqdn3d=10:8:0:0,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" -loop -1 assets/img/horror_jumpscare.gif
```

（`-loop -1` で1回だけ再生されるGIFになる。フレーム数や速さを変えたら `js/config.js` の `JUMPSCARE_MS` も合わせる）
