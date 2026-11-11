// 装饰：商店里买的，拖到草地上任意位置。每件是在营地原图上原地画出来再连一圈草地裁下的块（patch），落脚框 foot 用来判断重叠，
// anchor 是落脚点在块里的位置；spots 是宠物在它上面能坐 / 睡 / 玩的点（相对块左上角，画的像素）。第一步用占位块，尺寸先按这里的定
// 点的种类：sleep 睡、sit 坐、swing 坐在秋千座位上跟着摆、sniff 站在花前闻、tea 坐在水壶炉边喝茶、play 玩
// 11/07 精简（用户：家具太多，小动物坐上去 / 躺进去 / 爬上去的会穿模，留几样和草地贴合的就好；花坛也不要，改成各种直接种在草坪上的花）：
// 窝只留草窝，吃喝留水壶炉，玩留秋千、滚球，气氛留灯串、彩旗、风车、小灯笼、石灯笼、木栅栏，花草一大堆；下架的在 RETIRED 里按原价退暖豆

const { SCENE, rectInPoly, hitsNogo, expand } = require('./camp')

const CATEGORIES = [
  { id: 'nest', label: '窝' },
  { id: 'eat', label: '吃喝' },
  { id: 'play', label: '玩' },
  { id: 'plant', label: '花草' },
  { id: 'mood', label: '气氛' },
]

// 块的大小 = 原来定的大小 × DECOR_SCALE（10/26 用户嫌装饰太迷你：小帐篷才和小鸡一样大，整体放大 2.5 倍）。
// 裁给 Codex 的草地（decor_crop.py）还按原来的大小，Codex 照原来的比例画，decor_patch.py 裁块时再放大
const DECOR_SCALE = 2.5
const BASE_SIZES = { s: { w: 240, h: 200 }, m: { w: 360, h: 300 }, l: { w: 520, h: 420 } }
const SIZES = {}
Object.keys(BASE_SIZES).forEach((k) => {
  SIZES[k] = { w: BASE_SIZES[k].w * DECOR_SCALE, h: BASE_SIZES[k].h * DECOR_SCALE }
})
// 占地框（判断挤不挤、小动物绕着走的那一块）：按画出来的东西量的，每件写在自己那行的 foot: [宽, 深]（画的像素）。
// 11/11 用户：花并排种不下、到处说挤——以前按整块图的 0.6 × 0.4 一刀切，小花画出来才 300 多宽，占地却算 360 × 200，外面还各留 16。
//   花草：宽 = 画宽 × 0.7、深 100：挨着种叶子搭上一点才像一片花，前后两排隔 100 就行
//   家具：宽 ≈ 落在地上的那一截，深按个头
// 新加的装饰先按块的大小给个默认的，图回来以后量一下再填（都不比以前的大：旧档里摆好的不会变成挤着）
const DEFAULT_FOOT = { s: [300, 110], m: [450, 120], l: [760, 160] }
// 两件之间留的空：花和花之间不留（能挨着种成一片），别的每件自己外面留一点
const GAP = 12
// 放不下时自动吸到旁边最近能放的地方，最远挪这么多（画的像素，默认视角约 50 多点）；找的时候一圈圈往外、每圈隔这么远
const SNAP_REACH = 420
const SNAP_STEP = 30
// 紧挨着旁边那件、和它对齐的位置，比别处「近」这么多（优先选它）
const SNAP_PULL = 80
const GOLD_SWING = 'gold_swing'
// 下架了的：旧档里买过的按原价退暖豆、草地上的收走（camp-state 迁移）。
// 10/27 小帐篷（已经有大帐篷）、小树（后面一整片树林）；11/07 会穿模的（躺进去、坐上去、爬上去的）和花坛、几件杂物
const RETIRED = {
  tent: { name: '小帐篷', price: 120 }, sapling: { name: '小树', price: 80 },
  hammock: { name: '吊床', price: 100 }, treehouse: { name: '树洞小屋', price: 150 }, picnic: { name: '野餐垫', price: 60 }, table: { name: '小桌椅', price: 90 },
  ladder: { name: '木梯', price: 60 }, slide: { name: '小滑梯', price: 110 }, flowerbed: { name: '花坛', price: 50 }, pumpkins: { name: '南瓜堆', price: 60 },
  mailbox: { name: '信箱', price: 70 }, clothesline: { name: '晾衣绳', price: 50 }, scarecrow: { name: '稻草人', price: 70 },
}

// 一个块：size 小中大；spots 按块的比例给（x 从左、y 从上），下面展开成像素
function decor(id, name, category, price, size, extra = {}) {
  const patch = SIZES[size]
  const [fw, fh] = extra.foot || DEFAULT_FOOT[size]
  const foot = { w: fw, h: fh }
  const spots = (extra.spots || []).map((s) => ({ x: Math.round(s.x * patch.w), y: Math.round(s.y * patch.h), action: s.action }))
  return { id, name, category, price, size, max: extra.max || 1, patch, foot, anchor: { x: Math.round(patch.w / 2), y: Math.round(patch.h * 0.82) }, spots, fx: extra.fx || '' }
}

// 花：点在花前面（落脚框外），小动物背对着我们凑过去闻
const sniff1 = { spots: [{ x: 0.5, y: 0.92, action: 'sniff' }] }
const sniff2 = { spots: [{ x: 0.4, y: 0.9, action: 'sniff' }, { x: 0.6, y: 0.9, action: 'sniff' }] }
const sniff3 = { spots: [{ x: 0.3, y: 0.9, action: 'sniff' }, { x: 0.5, y: 0.9, action: 'sniff' }, { x: 0.7, y: 0.9, action: 'sniff' }] }

const DECOR = [
  decor('strawbed', '草窝', 'nest', 50, 's', { foot: [360, 140], spots: [{ x: 0.5, y: 0.6, action: 'sleep' }] }),
  // 水壶炉：两边各一个位置（落脚框外），两只对坐喝茶
  decor('kettle', '水壶炉', 'eat', 70, 's', { foot: [230, 110], fx: 'steam', spots: [{ x: 0.1, y: 0.8, action: 'tea' }, { x: 0.9, y: 0.8, action: 'tea' }] }),
  // 秋千的点在座位面上（按 art/decor/swing.png 量的）
  decor('swing', '秋千', 'play', 120, 'l', { foot: [760, 200], spots: [{ x: 0.49, y: 0.625, action: 'swing' }] }),
  decor('ball', '滚球', 'play', 40, 's', { foot: [260, 110], spots: [{ x: 0.5, y: 0.7, action: 'play' }] }),
  // 花草：都是直接长在草坪上的（没有花坛、花盆、篱笆，种上去不违和）。只有向日葵画好了；其余第 5 批出图，图回来之前不进商店
  //（商店只列 decor-art.js 里有高清块的）。用户 11/07：多设计几种能种在草坪上的花，比如一排向日葵
  decor('sunflower', '向日葵', 'plant', 50, 's', { foot: [270, 100], max: 3, ...sniff1 }),
  decor('sunflowers', '一排向日葵', 'plant', 120, 'l', { foot: [780, 120], max: 2, ...sniff3 }),
  decor('lavender', '薰衣草丛', 'plant', 60, 'm', { foot: [360, 100], max: 3, ...sniff2 }),
  decor('hydrangea', '绣球花', 'plant', 70, 'm', { foot: [450, 100], max: 3, ...sniff2 }),
  decor('tulips', '郁金香', 'plant', 40, 's', { foot: [220, 100], max: 3, ...sniff1 }),
  decor('daisies', '雏菊野花', 'plant', 30, 's', { foot: [270, 100], max: 3, ...sniff1 }),
  decor('cosmos', '格桑花', 'plant', 40, 's', { foot: [280, 100], max: 3, ...sniff1 }),
  decor('roses', '月季花丛', 'plant', 80, 'm', { foot: [460, 100], max: 3, ...sniff2 }),
  decor('dandelions', '蒲公英', 'plant', 30, 's', { foot: [250, 100], max: 3, ...sniff1 }),
  decor('clover', '三叶草地', 'plant', 30, 's', { foot: [310, 100], max: 3, ...sniff1 }),
  decor('rapeseed', '油菜花', 'plant', 60, 'm', { foot: [380, 100], max: 2, ...sniff2 }),
  decor('chrysanthemum', '菊花丛', 'plant', 60, 'm', { foot: [340, 100], max: 3, ...sniff2 }),
  decor('mint', '薄荷丛', 'plant', 40, 's', { foot: [280, 100], max: 3, ...sniff1 }),
  decor('poppies', '虞美人', 'plant', 40, 's', { foot: [270, 100], max: 3, ...sniff1 }),
  decor('bluebells', '风铃草', 'plant', 40, 's', { foot: [220, 100], max: 3, ...sniff1 }),
  decor('mushrooms', '小蘑菇', 'plant', 30, 's', { foot: [220, 100], max: 3, ...sniff1 }),
  decor('lights', '灯串', 'mood', 90, 'l', { foot: [760, 110], fx: 'glow' }),
  decor('bunting', '彩旗', 'mood', 60, 'm', { foot: [520, 100] }),
  decor('windmill', '风车', 'mood', 50, 's', { foot: [200, 100], fx: 'spin' }),
  decor('lantern', '小灯笼', 'mood', 40, 's', { foot: [160, 90], max: 2, fx: 'glow' }),
  decor('stonelamp', '石灯笼', 'mood', 80, 's', { foot: [230, 110], fx: 'glow' }),
  decor('fence', '木栅栏', 'mood', 30, 'm', { foot: [520, 80], max: 3 }),
  // 全收集奖励，商店买不到
  decor(GOLD_SWING, '金色秋千', 'play', 0, 'l', { foot: [760, 200], spots: [{ x: 0.49, y: 0.625, action: 'swing' }], fx: 'glow' }),
]

function decorById(id) {
  return DECOR.find((d) => d.id === id) || null
}

// 落脚框：以落脚点为底边中点往上
function footRect(decorId, x, y) {
  const d = decorById(decorId)
  return { left: x - d.foot.w / 2, top: y - d.foot.h, right: x + d.foot.w / 2, bottom: y }
}

// 块的位置：anchor 对准落脚点
function patchRect(decorId, x, y) {
  const d = decorById(decorId)
  const left = x - d.anchor.x
  const top = y - d.anchor.y
  return { left, top, right: left + d.patch.w, bottom: top + d.patch.h }
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

// 这件外面留多少空：花草不留
const gapOf = (d) => (d.category === 'plant' ? 0 : GAP)

// 这里为什么不能放（能放返回 ''）：云函数校验和页面提示用同一套话
function placeProblem(placed, decorId, x, y, ignoreUid) {
  const d = decorById(decorId)
  if (!d || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return '放不到这里哦'
  const foot = footRect(decorId, x, y)
  if (!rectInPoly(foot, SCENE.grass)) return '只能放在草地上'
  if (hitsNogo(foot, 0)) return '这儿放不下，挪开一点'
  const mine = expand(foot, gapOf(d))
  for (const p of placed) {
    const o = decorById(p.id)
    if (p.uid === ignoreUid || !o) continue
    if (overlaps(mine, expand(footRect(p.id, p.x, p.y), gapOf(o)))) return '这儿挤不下，往旁边挪一点'
  }
  return ''
}

// 想放在 (x, y)：能放就是它自己；放不下就找旁边最近能放的地方（最远挪 SNAP_REACH），找不到返回 null。
// 先看压着了谁：手指偏在它哪一边，就优先靠到那一边紧挨着它（同一条线上的左 / 右，或者正前 / 正后一排）——
// 挨着种一排花、摆一排栅栏时自己就对齐了（这样的位置比别处「近」SNAP_PULL）；别的再一圈圈往外找。
// 页面拖的时候拿它定影子落在哪，松手就放在那儿（云函数照样用 placeProblem 校验）
function nearestSpot(placed, decorId, x, y, ignoreUid) {
  const d = decorById(decorId)
  if (!d || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return null
  const fits = (px, py) => !placeProblem(placed, decorId, px, py, ignoreUid)
  if (fits(x, y)) return { x, y, moved: false }
  let best = null
  const consider = (px, py, pull = 0) => {
    const cx = Math.round(px)
    const cy = Math.round(py)
    const far = Math.hypot(cx - x, cy - y)
    const score = far - pull
    if (far > SNAP_REACH || (best && score >= best.score) || !fits(cx, cy)) return
    best = { x: cx, y: cy, score }
  }
  ;(placed || []).forEach((p) => {
    const o = decorById(p.id)
    if (p.uid === ignoreUid || !o) return
    const gap = gapOf(d) + gapOf(o) + 1
    const side = (d.foot.w + o.foot.w) / 2 + gap
    // 手指相对这件偏了多少：横着按两个占地框的半宽算，竖着按半深算（占地框中心对中心）
    const nx = (x - p.x) / ((d.foot.w + o.foot.w) / 2)
    const ny = (y - d.foot.h / 2 - (p.y - o.foot.h / 2)) / ((d.foot.h + o.foot.h) / 2)
    const sideways = Math.abs(nx) >= Math.abs(ny)
    const front = p.y + d.foot.h + gap
    const behind = p.y - o.foot.h - gap
    consider(p.x + (nx >= 0 ? side : -side), p.y, sideways ? SNAP_PULL : 0)
    consider(p.x - (nx >= 0 ? side : -side), p.y)
    consider(x, ny >= 0 ? front : behind, sideways ? 0 : SNAP_PULL)
    consider(x, ny >= 0 ? behind : front)
  })
  for (let r = SNAP_STEP; r <= SNAP_REACH && !(best && best.score <= r); r += SNAP_STEP) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / (SNAP_STEP * 1.5)))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI
      consider(x + r * Math.cos(a), y + r * Math.sin(a))
    }
  }
  return best ? { x: best.x, y: best.y, moved: true } : null
}

module.exports = { CATEGORIES, DECOR_SCALE, SIZES, DECOR, GOLD_SWING, RETIRED, SNAP_REACH, decorById, footRect, patchRect, placeProblem, nearestSpot }
