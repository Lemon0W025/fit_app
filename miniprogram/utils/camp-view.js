// 营地画面的换算（纯函数，有单测）：画的像素 ↔ 屏幕像素、底图切块、装饰块、拖拽幽灵、背包 / 商店 / 食盆的展示数据、色调

const { W, H, scaleAt } = require('./shared/camp')
const { RARITIES } = require('./shared/garden')
const { petById } = require('./shared/pets')
const { foodById } = require('./shared/foods')
const { DECOR, CATEGORIES, decorById, footRect } = require('./shared/decor')
const { SCENE } = require('./shared/camp')

const Z_DECOR = 100
const MARGIN_RATIO = 0.6
const BOWL_PX = 200 // 食盆在画上的直径（像素）

const fmt = (n) => Math.round(n * 100) / 100

function campLayout(win) {
  const k = win.width / W
  const width = W * k
  const height = H * k
  const margin = win.width * MARGIN_RATIO
  return { W, H, k, width, height, margin, viewWidth: width + margin * 2, viewHeight: height + margin * 2 }
}

function toScreen(x, y, L) {
  return { x: x * L.k, y: y * L.k }
}

// 手指 → 画的像素：worldRect 是 #world 此刻的 boundingClientRect（含缩放）
function fromTouch(clientX, clientY, rect, L) {
  const scale = rect.width / L.width
  return { x: ((clientX - rect.left) / scale) / L.k, y: ((clientY - rect.top) / scale) / L.k }
}

function baseTiles(L, base) {
  const prefix = base || '/images/camp/base/'
  const tiles = []
  const tw = L.width / 4
  const th = L.height / 4
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      tiles.push({ key: `t${row}${col}`, image: `${prefix}t${row}${col}.jpg`, left: fmt(col * tw), top: fmt(row * th), width: fmt(tw), height: fmt(th) })
    }
  }
  return tiles
}

const petImage = (id) => `/images/camp/pets/${id}.png`
const petFace = (id) => `/images/camp/pets/${id}-face.png`
const foodImage = (id) => `/images/camp/foods/${id}.png`
const decorImage = (id, base) => `${base || '/images/camp/decor/'}${id}.png`
const zOf = (y) => Z_DECOR + Math.round(y / 4)

function patchView(d, x, y, L, base) {
  const s = scaleAt(y)
  return {
    image: decorImage(d.id, base),
    left: fmt((x - d.anchor.x * s) * L.k),
    top: fmt((y - d.anchor.y * s) * L.k),
    width: fmt(d.patch.w * s * L.k),
    height: fmt(d.patch.h * s * L.k),
    z: zOf(y),
  }
}

function decorViews(placed, L, base) {
  return placed
    .map((p) => ({ p, d: decorById(p.id) }))
    .filter((x) => x.d)
    .map(({ p, d }) => ({ uid: p.uid, id: p.id, name: d.name, x: p.x, y: p.y, ...patchView(d, p.x, p.y, L, base) }))
    .sort((a, b) => a.z - b.z)
}

// 拖着走的幽灵：块 + 落脚框（绿能放、红不能）
function ghostView(decorId, x, y, L, ok) {
  const d = decorById(decorId)
  const foot = footRect(decorId, x, y)
  return {
    ...patchView(d, x, y, L, ''),
    ok: !!ok,
    foot: { left: fmt(foot.left * L.k), top: fmt(foot.top * L.k), width: fmt((foot.right - foot.left) * L.k), height: fmt((foot.bottom - foot.top) * L.k) },
  }
}

function rarityOf(id) {
  return RARITIES.find((r) => r.id === id) || RARITIES[0]
}

function foodBag(foods) {
  return (foods || [])
    .map(({ id, count }) => {
      const f = foodById(id)
      if (!f) return null
      const r = rarityOf(f.rarity)
      return { id, name: f.name, count, rarity: r.id, rarityLabel: r.label, rarityColor: r.color, image: foodImage(id), term: f.term || '' }
    })
    .filter(Boolean)
}

function decorBag(unplaced) {
  return (unplaced || [])
    .map(({ id, count }) => {
      const d = decorById(id)
      return d ? { id, name: d.name, count, image: decorImage(id), category: d.category } : null
    })
    .filter(Boolean)
}

function shopGroups(owned, beans) {
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    items: DECOR.filter((d) => d.category === c.id && d.price > 0).map((d) => {
      const have = (owned && owned[d.id]) || 0
      return { id: d.id, name: d.name, price: d.price, image: decorImage(d.id), have, max: d.max, soldOut: have >= d.max, canAfford: beans >= d.price }
    }),
  }))
}

function bowlViews(bowls, L) {
  return SCENE.bowls.map(([bx, by], index) => {
    const b = (bowls && bowls[index]) || { food: null, peeking: null }
    const size = BOWL_PX * scaleAt(by) * L.k
    return {
      index,
      left: fmt(bx * L.k - size / 2),
      top: fmt(by * L.k - size / 2),
      size: fmt(size),
      z: zOf(by),
      food: b.food || '',
      foodImage: b.food ? foodImage(b.food) : '',
      peeking: b.peeking || '',
      peekImage: b.peeking ? petFace(b.peeking) : '',
    }
  })
}

// 一天的光：傍晚偏橙、夜里偏蓝
function tintFor(hour) {
  if (hour >= 19 || hour < 6) return 'night'
  if (hour >= 17) return 'dusk'
  return ''
}

// 打卡结果页的横幅
function arrivalCard(arrival) {
  if (!arrival) return null
  if (arrival.id) {
    const p = petById(arrival.id)
    return { image: petImage(arrival.id), text: `${p ? p.name : ''}闻着${arrival.foodName}的香味，搬进营地啦！` }
  }
  const p = petById(arrival.ate)
  return { image: petImage(arrival.ate), text: `${p ? p.name : ''}把食盆里的${arrival.foodName}吃了，营地里没有别的小动物爱吃它啦` }
}

// 让画上的点 (x, y) 停在屏幕正中：movable-view 的 x / y 是 view 左上角相对可视区的位移，缩放以 view 中心为原点
function focusOffset(x, y, L, win, scale) {
  const cx = L.viewWidth / 2
  const cy = L.viewHeight / 2
  const px = L.margin + x * L.k
  const py = L.margin + y * L.k
  return { x: win.width / 2 - cx - scale * (px - cx), y: win.height / 2 - cy - scale * (py - cy), scale }
}

// 首页默认视角：画填满屏幕高度、篝火（暖暖锅）在屏幕正中略偏下（上面给帐篷和界面留地方）；正方形的画一屏只看到一半宽，两边拖着看，捏一下能缩到 0.8 看全貌
function homeView(L, win) {
  const scale = Math.min(2.5, Math.max(1, Math.round((win.height / L.height) * 100) / 100))
  return focusOffset(SCENE.fire[0], SCENE.fire[1] - 200, L, win, scale)
}

// 暖暖锅：今天打了几顿正餐（早午晚印章里有状态的），锅里就有几层（0～3）
function potLevel(daily) {
  if (!daily || !daily.stamps) return 0
  return Math.min(3, daily.stamps.filter((s) => s.state && s.state !== 'none').length)
}

// 帐篷和暖暖锅是从底图里抠出来的独立一层（zy 是它们落地的 y）：宠物走到后面被挡住、走到前面盖在上面。锅按今天打了几顿换图
function cutoutViews(L, potLevel, base) {
  const prefix = base || '/images/camp/cut/'
  return Object.keys(SCENE.cutouts).map((key) => {
    const c = SCENE.cutouts[key]
    const [l, t, r, b] = c.box
    const file = key === 'pot' ? `pot-${Math.min(3, Math.max(0, potLevel || 0))}.png` : `${key}.png`
    return { key, image: prefix + file, left: fmt(l * L.k), top: fmt(t * L.k), width: fmt((r - l) * L.k), height: fmt((b - t) * L.k), z: zOf(c.zy) + 1 }
  })
}

module.exports = {
  Z_DECOR, campLayout, toScreen, fromTouch, baseTiles, decorViews, ghostView, zOf,
  petImage, petFace, foodImage, decorImage, rarityOf, foodBag, decorBag, shopGroups, bowlViews, tintFor, arrivalCard, focusOffset, homeView, potLevel, cutoutViews,
}
