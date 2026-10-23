// 每只小动物的动画拼图参数（拼图在云存储 config.animArt 下，文件名 <id>.png；scripts/pack_anim.py 打包时会回写 top）
// special：第 17～18 格画的专属动作（和 garden-life 的 action 同名）；top：发呆帧头顶上空白占格高的比例（定气泡和水面的高度）
module.exports = {
  chick: { special: 'peck', top: 0.12 },
  rabbit: { special: 'eat', top: 0.12 },
  duck: { special: 'swim', top: 0.12 },
  turtle: { special: 'bask', top: 0.3 },
  tabby_cat: { special: 'perch', top: 0.12 },
  ginger_cat: { special: 'soak', top: 0.15 },
  panda: { special: 'eat', top: 0.1 },
  crane: { special: 'soak', top: 0.08 },
  panda_family: { special: 'eat', top: 0.1 },
  bird: { special: '', top: 0.15 },
  butterfly: { special: '', top: 0.2 },
}
