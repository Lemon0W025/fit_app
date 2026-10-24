// 每只小动物的动画拼图参数（拼图在云存储 config.animArt 下，文件名 <id>.png；scripts/pack_anim.py 打包时会回写 top）
// special：第 17～18 格画的专属动作（和 garden-life 的 action 同名）；top：发呆帧头顶上空白占格高的比例（定气泡和水面的高度）
module.exports = {
  chick: { special: 'peck', top: 0.2 },
  rabbit: { special: 'eat', top: 0.17 },
  duck: { special: 'swim', top: 0.1 },
  turtle: { special: 'bask', top: 0.41 },
  tabby_cat: { special: 'perch', top: 0.07 },
  ginger_cat: { special: 'soak', top: 0.23 },
  panda: { special: 'eat', top: 0.32 },
  crane: { special: 'soak', top: 0.34 },
  panda_family: { special: 'eat', top: 0.27 },
  bird: { special: '', top: 0.52 },
  butterfly: { special: '', top: 0.53 },
}
