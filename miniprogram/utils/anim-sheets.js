// 有逐帧拼图的宠物（拼图在云存储 config.animArt 下，<id>-a.png / <id>-b.png；scripts/pack_anim.py 打包时回写）
// top：待机帧头顶上空白占格高的比例（定气泡的高度）。没列到的宠物页面用单张图 + CSS 步态
module.exports = {
  doudou: { top: 0.23 },
  nuonuo: { top: 0.3 },
  lianlian: { top: 0.19 },
  shishi: { top: 0.23 },
}
