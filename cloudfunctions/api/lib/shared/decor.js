// 装饰：商店里买的，拖到草地上任意位置。每件是在营地原图上原地画出来再连一圈草地裁下的块（patch），落脚框 foot 用来判断重叠，
// anchor 是落脚点在块里的位置；spots 是宠物在它上面能坐 / 睡 / 玩的点（相对块左上角，画的像素）。第一步用占位块，尺寸先按这里的定
// 点的种类：sleep 睡、sit 坐（野餐垫上的会吃点心）、swing 坐在秋千座位上跟着摆、sniff 站在花前闻、slide 从梯子脚爬上去再滑下来（ride：滑梯顶、滑道出口）、
// climb 爬上去张望再下来（ride：顶上）、tea 坐在水壶炉边喝茶、play 玩、perch 站在高处（会飞的才去）

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
// 落脚框：宽占块的 0.6、深（上下）占 0.4——放大以后前后可以挨得近一点（后面的被前面的挡一点，45 度俯视本来就这样），24 件全买齐也摆得下
const FOOT_RATIO = { w: 0.6, h: 0.4 }
const OVERLAP_MARGIN = 16
const GOLD_SWING = 'gold_swing'
// 下架了的（10/27：已经有大帐篷，小帐篷重复；后面一整片树林，不要小树）：旧档里买过的按原价退暖豆（camp-state 迁移）
const RETIRED = { tent: { name: '小帐篷', price: 120 }, sapling: { name: '小树', price: 80 } }

// 一个块：size 小中大；spots 按块的比例给（x 从左、y 从上），下面展开成像素
function decor(id, name, category, price, size, extra = {}) {
  const patch = SIZES[size]
  const foot = { w: Math.round(patch.w * FOOT_RATIO.w), h: Math.round(patch.h * FOOT_RATIO.h) }
  const spots = (extra.spots || []).map((s) => ({ x: Math.round(s.x * patch.w), y: Math.round(s.y * patch.h), action: s.action }))
  const ride = (extra.ride || []).map((s) => ({ x: Math.round(s.x * patch.w), y: Math.round(s.y * patch.h) }))
  return { id, name, category, price, size, max: extra.max || 1, patch, foot, anchor: { x: Math.round(patch.w / 2), y: Math.round(patch.h * 0.82) }, spots, ride, fx: extra.fx || '' }
}

const DECOR = [
  // 吊床的点在布的最低处（睡在里面，跟着布轻轻晃）
  decor('hammock', '吊床', 'nest', 100, 'l', { spots: [{ x: 0.5, y: 0.7, action: 'sleep' }] }),
  decor('treehouse', '树洞小屋', 'nest', 150, 'l', { spots: [{ x: 0.5, y: 0.7, action: 'sleep' }] }),
  decor('strawbed', '草窝', 'nest', 50, 's', { spots: [{ x: 0.5, y: 0.6, action: 'sleep' }] }),
  decor('picnic', '野餐垫', 'eat', 60, 'm', { spots: [{ x: 0.3, y: 0.6, action: 'sit' }, { x: 0.5, y: 0.5, action: 'sit' }, { x: 0.7, y: 0.6, action: 'sit' }] }),
  decor('table', '小桌椅', 'eat', 90, 'm', { spots: [{ x: 0.25, y: 0.65, action: 'sit' }, { x: 0.75, y: 0.65, action: 'sit' }] }),
  // 水壶炉：两边各一个位置（落脚框外），两只对坐喝茶
  decor('kettle', '水壶炉', 'eat', 70, 's', { fx: 'steam', spots: [{ x: 0.1, y: 0.8, action: 'tea' }, { x: 0.9, y: 0.8, action: 'tea' }] }),
  // 秋千的点在座位面上（按 art/decor/swing.png 量的）
  decor('swing', '秋千', 'play', 120, 'l', { spots: [{ x: 0.49, y: 0.625, action: 'swing' }] }),
  decor('ball', '滚球', 'play', 40, 's', { spots: [{ x: 0.5, y: 0.7, action: 'play' }] }),
  // 木梯：梯子脚（在梯子前面）→ 爬到顶上的平台张望 → 爬下来（ride：平台，按 art/decor/ladder.png 量的）
  decor('ladder', '木梯', 'play', 60, 'm', { spots: [{ x: 0.38, y: 0.84, action: 'climb' }], ride: [{ x: 0.52, y: 0.17 }] }),
  // 滑梯：梯子脚 → 爬到滑道顶上 → 坐着滑出滑道、落在滑道口前面的草上（按 art/decor/slide.png 量的；落地点比落脚点靠前，排在滑梯前面）
  decor('slide', '小滑梯', 'play', 110, 'l', { spots: [{ x: 0.29, y: 0.61, action: 'slide' }], ride: [{ x: 0.44, y: 0.215 }, { x: 0.73, y: 0.85 }] }),
  // 花：点在花前面（落脚框外），小动物背对着我们凑过去闻
  decor('flowerbed', '花坛', 'plant', 50, 'm', { max: 3, fx: 'butterfly', spots: [{ x: 0.4, y: 0.9, action: 'sniff' }, { x: 0.6, y: 0.9, action: 'sniff' }] }),
  decor('pumpkins', '南瓜堆', 'plant', 60, 'm', { spots: [{ x: 0.5, y: 0.5, action: 'sit' }] }),
  decor('sunflower', '向日葵', 'plant', 50, 's', { max: 3, spots: [{ x: 0.5, y: 0.92, action: 'sniff' }] }),
  // 10/27 加的各种花（替下架的小树）：第 5 批出图，图回来之前不进商店（商店只列 decor-art.js 里有高清块的）
  decor('lavender', '薰衣草丛', 'plant', 60, 'm', { max: 3, spots: [{ x: 0.4, y: 0.9, action: 'sniff' }, { x: 0.6, y: 0.9, action: 'sniff' }] }),
  decor('hydrangea', '绣球花', 'plant', 70, 'm', { max: 3, spots: [{ x: 0.4, y: 0.9, action: 'sniff' }, { x: 0.6, y: 0.9, action: 'sniff' }] }),
  decor('tulips', '郁金香', 'plant', 40, 's', { max: 3, spots: [{ x: 0.5, y: 0.92, action: 'sniff' }] }),
  decor('daisies', '雏菊野花', 'plant', 30, 's', { max: 3, spots: [{ x: 0.5, y: 0.92, action: 'sniff' }] }),
  decor('cosmos', '格桑花', 'plant', 40, 's', { max: 3, spots: [{ x: 0.5, y: 0.92, action: 'sniff' }] }),
  decor('roses', '月季花丛', 'plant', 80, 'm', { max: 3, spots: [{ x: 0.4, y: 0.9, action: 'sniff' }, { x: 0.6, y: 0.9, action: 'sniff' }] }),
  decor('lights', '灯串', 'mood', 90, 'l', { fx: 'glow' }),
  decor('bunting', '彩旗', 'mood', 60, 'm'),
  decor('windmill', '风车', 'mood', 50, 's', { fx: 'spin' }),
  decor('mailbox', '信箱', 'mood', 70, 's'),
  decor('lantern', '小灯笼', 'mood', 40, 's', { max: 2, fx: 'glow' }),
  decor('stonelamp', '石灯笼', 'mood', 80, 's', { fx: 'glow' }),
  decor('fence', '木栅栏', 'mood', 30, 'm', { max: 3 }),
  decor('clothesline', '晾衣绳', 'mood', 50, 'm'),
  decor('scarecrow', '稻草人', 'mood', 70, 'm', { spots: [{ x: 0.5, y: 0.15, action: 'perch' }] }),
  // 全收集奖励，商店买不到
  decor(GOLD_SWING, '金色秋千', 'play', 0, 'l', { spots: [{ x: 0.49, y: 0.625, action: 'swing' }], fx: 'glow' }),
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

// 这里为什么不能放（能放返回 ''）：云函数校验和页面提示用同一套话
function placeProblem(placed, decorId, x, y, ignoreUid) {
  const d = decorById(decorId)
  if (!d || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return '放不到这里哦'
  const foot = footRect(decorId, x, y)
  if (!rectInPoly(foot, SCENE.grass)) return '只能放在草地上'
  if (hitsNogo(foot, 0)) return '这儿放不下，挪开一点'
  const mine = expand(foot, OVERLAP_MARGIN)
  for (const p of placed) {
    if (p.uid === ignoreUid || !decorById(p.id)) continue
    if (overlaps(mine, expand(footRect(p.id, p.x, p.y), OVERLAP_MARGIN))) return '和别的东西挤着了'
  }
  return ''
}

module.exports = { CATEGORIES, DECOR_SCALE, SIZES, DECOR, GOLD_SWING, RETIRED, decorById, footRect, patchRect, placeProblem }
