// 有逐帧拼图的宠物（拼图在云存储 config.animArt 下，一只一张 <id>.png：A、B、C 上下拼着；scripts/pack_anim.py 打包时回写）
// top：待机帧头顶上空白占格高的比例（定气泡的高度）；c：有 <id>-c.png（正面 / 背影）。没列到的宠物页面用单张图 + CSS 步态
module.exports = {
  doudou: { top: 0.23, c: true },
  nuonuo: { top: 0.31, c: true },
  lianlian: { top: 0.19, c: true },
  shishi: { top: 0.23, c: true },
  huahua: { top: 0.28, c: true },
  guigui: { top: 0.25, c: true },
  qiqi: { top: 0.22, c: true },
  shushu: { top: 0.28, c: true },
  jutuan: { top: 0.32, c: true },
  sunbao: { top: 0.19, c: true },
  chacha: { top: 0.23, c: true },
  hehe: { top: 0.29, c: true },
}
