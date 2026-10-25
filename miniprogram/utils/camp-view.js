// 营地画面的换算（纯函数，有单测）：画的像素 ↔ 屏幕像素、底图切块、装饰块、拖拽幽灵、背包 / 商店 / 食盆的展示数据、色调

const { W, H, scaleAt } = require('./shared/camp')
const { RARITIES } = require('./shared/garden')
const { petById } = require('./shared/pets')
const { foodById } = require('./shared/foods')
const { DECOR, CATEGORIES, decorById, footRect } = require('./shared/decor')
const { SCENE } = require('./shared/camp')
const { nightLook, nightFilter } = require('./camp-light')
const DECOR_ART = require('./decor-art')

const Z_DECOR = 100
const BOWL_PX = 270 // 食盆在画上的直径（像素，照画量的）
const HOME_ZOOM = 0.72 // 默认视角：画的高度铺满屏幕的 0.72 倍（锅占屏幕宽度四成多，看得到营地边上的树林和草地）
const DETAIL_ZOOM = 2 // 最多放大到「画的高度铺满屏幕」的 2 倍
const TILE = 1024 // 底图一块（画的像素）

const fmt = (n) => Math.round(n * 100) / 100

// 整个世界 = 营地画（W×H）+ 上面补的天空、下面补的草地（SCENE.frame，scripts/camp/extend_art.py），movable-view 就是整个世界、不留白。
// 1 倍是默认视角（k：画的像素 → 屏幕像素）；minScale 是全景（整幅宽度正好放进屏幕），maxScale 看细节；
// 配上 out-of-bounds=false，怎么拖、怎么捏都盖满屏幕、看不到边。width / height / top 是营地画（#world）的大小和在世界里的位置
function campLayout(win) {
  const { top, bottom } = SCENE.frame
  const k = Math.max((HOME_ZOOM * win.height) / H, win.width / W)
  const worldWidth = W * k
  const worldHeight = (H + top + bottom) * k
  const minScale = Math.min(1, Math.max(0.5, Math.ceil(Math.max(win.width / worldWidth, win.height / worldHeight) * 1000) / 1000)) // 0.5：组件最小只认到这儿
  const maxScale = Math.max(1, Math.round(((DETAIL_ZOOM * win.height) / H / k) * 100) / 100)
  return { W, H, k, width: W * k, height: H * k, top: top * k, worldWidth, worldHeight, minScale, maxScale }
}

function toScreen(x, y, L) {
  return { x: x * L.k, y: y * L.k }
}

// 手指 → 画的像素：worldRect 是 #world 此刻的 boundingClientRect（含缩放）
function fromTouch(clientX, clientY, rect, L) {
  const scale = rect.width / L.width
  return { x: ((clientX - rect.left) / scale) / L.k, y: ((clientY - rect.top) / scale) / L.k }
}

// 夜里（19～6 点）换整套夜景底图和抠图（文件名加 night-），白天 / 傍晚用日景（傍晚再叠一层橙色）
const isNight = (hour) => hour >= 19 || hour < 6

// 包里垫的整个世界（768 宽的低清版，含上下补的天空和草地）：一打开就有画，高清块（云存储）下完盖在上面；块之间缩放时露的细缝透出来的也是同一张画
const backdropImage = (night) => `/images/camp/base/${night ? 'night-' : ''}world.jpg`

// 高清切块（云存储 4×4）；没有云端前缀（没配或加载失败过）就不铺，只剩垫图
function baseTiles(L, base, night) {
  if (!base) return []
  const prefix = base + (night ? 'night-' : '')
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

// 上下补的天空、草地的高清块（和底图同一个云端前缀）：天空 u0*、u1*，草地 d0*（多盖住画最下面 overlap 那段发虚的）、d1*，每行 4 块。
// 坐标是在整个世界（movable-view）里的；画在 #world 后面，盖得住画最下面那段
function frameTiles(L, base, night) {
  if (!base) return []
  const { top, overlap } = SCENE.frame
  const rows = [['u0', 0, TILE], ['u1', TILE, 2 * TILE], ['d0', top + H - overlap, top + H + TILE], ['d1', top + H + TILE, top + H + 2 * TILE]]
  const prefix = base + (night ? 'night-' : '')
  const tiles = []
  rows.forEach(([row, y0, y1]) => {
    for (let col = 0; col < 4; col++) {
      tiles.push({ key: `${row}${col}`, image: `${prefix}${row}${col}.jpg`, left: fmt(col * TILE * L.k), top: fmt(y0 * L.k), width: fmt(TILE * L.k), height: fmt((y1 - y0) * L.k) })
    }
  })
  return tiles
}

const petImage = (id) => `/images/camp/pets/${id}.png`
const petFace = (id) => `/images/camp/pets/${id}-face.png`
const foodImage = (id) => `/images/camp/foods/${id}.png`
// base：云端高清块的前缀（config.decorArt），只有画好了的（decor-art.js）才有；别的、和商店 / 背包里的小图都用包里的
const decorImage = (id, base) => `${base && DECOR_ART.indexOf(id) !== -1 ? base : '/images/camp/decor/'}${id}.png`
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

// night：夜里按站的位置调亮度和暖色（camp-light.js，照夜景的光算的），火边亮、远处暗
function decorViews(placed, L, base, night, lit = true) {
  return placed
    .map((p) => ({ p, d: decorById(p.id) }))
    .filter((x) => x.d)
    .map(({ p, d }) => ({ uid: p.uid, id: p.id, name: d.name, x: p.x, y: p.y, ...patchView(d, p.x, p.y, L, base), night: !!night, ...(night ? nightLook(p.x, p.y, lit) : { light: '', moon: 0, moonLight: '' }) }))
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

// 食盆：碗是画上的；放了吃的就在碗口里画一小堆（images/camp/foods/bowl/，scripts/camp/bowl_food.py），
// 再把从画上抠下来的碗沿和碗身（bowl-0 / bowl-1，cutBase 那儿）盖在上面：吃的在碗里，不是浮在碗上的一片
// lit：篝火点着没有（锅是空的火不烧）。夜里碗原来被篝火照成暖黄，火没点就换熄了火的碗沿、食物按月光上色
function bowlViews(bowls, L, night, base, lit = true) {
  const { rx, ry, boxes } = SCENE.bowl
  const ext = base ? 'webp' : 'png'
  return SCENE.bowls.map(([bx, by], index) => {
    const b = (bowls && bowls[index]) || { food: null, peeking: null }
    const [l, t, r, bt] = boxes[index]
    return {
      index,
      left: fmt(l * L.k),
      top: fmt(t * L.k),
      width: fmt((r - l) * L.k),
      height: fmt((bt - t) * L.k),
      z: zOf(by),
      rimImage: `${base || '/images/camp/cut/'}${night ? 'night-' : ''}bowl-${index}${night && !lit ? '-off' : ''}.${ext}`,
      pile: { left: fmt((bx - rx - l) * L.k), top: fmt((by - ry - t) * L.k), width: fmt(2 * rx * L.k), height: fmt(2 * ry * L.k) },
      food: b.food || '',
      foodImage: b.food ? `/images/camp/foods/bowl/${b.food}.png` : '',
      peeking: b.peeking || '',
      peekImage: b.peeking ? petFace(b.peeking) : '',
      light: night ? nightFilter(bx, by, lit) : '',
    }
  })
}

// 一天的光：傍晚偏橙、夜里偏蓝
function tintFor(hour) {
  // 夜里整套换成夜景图，不叠色；傍晚在日景上叠一层橙
  if (hour >= 17 && hour < 19) return 'dusk'
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

// 让营地画上的点 (x, y) 尽量停在屏幕正中。movable-view 的 x / y 是缩放后整个世界的左上角在屏幕上的位置；
// 推到边上的拉回来（世界始终盖满屏幕，和组件 out-of-bounds=false 自己的限位一样）
function focusOffset(x, y, L, win, scale = 1) {
  const fit = (v, lo) => fmt(Math.min(0, Math.max(lo, v)))
  return {
    x: fit(win.width / 2 - scale * x * L.k, win.width - scale * L.worldWidth),
    y: fit(win.height / 2 - scale * (L.top + y * L.k), win.height - scale * L.worldHeight),
    scale,
  }
}

// 首页默认视角：1 倍、篝火（暖暖锅）横着在屏幕正中、营地画竖着居中；捏小看全景（整幅宽度），捏大看细节
function homeView(L, win) {
  return focusOffset(SCENE.fire[0], H / 2, L, win, 1)
}

// 暖暖锅：今天打了几顿正餐（早午晚印章里有状态的），锅里就有几层（0～3）
function potLevel(daily) {
  if (!daily || !daily.stamps) return 0
  return Math.min(3, daily.stamps.filter((s) => s.state && s.state !== 'none').length)
}

// 前沿折线在 x 处的 y（两头以外按端点）
function frontAt(front, x) {
  if (x <= front[0][0]) return front[0][1]
  for (let i = 1; i < front.length; i++) {
    const [x0, y0] = front[i - 1]
    const [x1, y1] = front[i]
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1)
  }
  return front[front.length - 1][1]
}

// 抠图层按「条」排前后：一般一整块一条（按 zy）；帐篷这种前沿斜着的竖着切成 strip 宽的条，每条按自己那段前沿最靠上的点排
// （宠物、装饰只要站在这段前沿前面就盖在这条上面，站在后面就被它挡住；禁区比前沿再往外留了一点，站得到的地方不会排错）
function cutoutStrips() {
  const out = []
  Object.keys(SCENE.cutouts).forEach((key) => {
    const c = SCENE.cutouts[key]
    const [l, t, r, b] = c.box
    if (!c.front || !c.strip) {
      out.push({ key, cut: key, l, t, r, b, zy: c.zy })
      return
    }
    for (let x = l, i = 0; x < r; x += c.strip, i++) {
      const xr = Math.min(r, x + c.strip)
      let zy = Math.min(frontAt(c.front, x), frontAt(c.front, xr))
      c.front.forEach(([fx, fy]) => {
        if (fx > x && fx < xr) zy = Math.min(zy, fy)
      })
      out.push({ key: `${key}-${i}`, cut: key, l: x, t, r: xr, b, zy: Math.round(zy) })
    }
  })
  return out
}

// 帐篷、暖暖锅、木盖、提灯是从底图里抠出来的独立一层：宠物、装饰走到后面被挡住、走到前面盖在上面。锅按今天打了几顿换图
// 云端的是 WebP（真彩、小），包里兜底的是 PNG；一条只露出整张图的一段（外面一层 view 裁，里面整张图往左挪）
// 锅按今天的层数换图（0 层是空锅：从熄了火的画上抠的，锅底不再被火照亮）；夜里火没点时木盖换熄了火的那张（原来被篝火照成暖黄）
function cutoutViews(L, potLevel, base, night) {
  const prefix = (base || '/images/camp/cut/') + (night ? 'night-' : '')
  const ext = base ? 'webp' : 'png'
  const level = Math.min(3, Math.max(0, potLevel || 0))
  return cutoutStrips().map((s) => {
    const c = SCENE.cutouts[s.cut]
    const file = s.cut === 'pot' ? `pot-${level}` : s.cut === 'lid' && night && !level ? 'lid-off' : s.cut
    return {
      key: s.key, image: `${prefix}${file}.${ext}`, z: zOf(s.zy) + 1,
      left: fmt(s.l * L.k), top: fmt(s.t * L.k), width: fmt((s.r - s.l) * L.k), height: fmt((s.b - s.t) * L.k),
      imgLeft: fmt((c.box[0] - s.l) * L.k), imgWidth: fmt((c.box[2] - c.box[0]) * L.k),
    }
  })
}

// setData 只发变了的字段：{ 'pets[0].left': … }；以前没有就整个发。图片的 src 一样也别重发（云存储的图重设一次就重新取一次，会闪一下）
function changedPaths(prefix, prev, next) {
  if (!prev) return { [prefix]: next }
  const out = {}
  Object.keys(next).forEach((k) => {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out[`${prefix}.${k}`] = next[k]
  })
  return out
}

module.exports = {
  Z_DECOR, campLayout, toScreen, fromTouch, baseTiles, frameTiles, decorViews, ghostView, zOf,
  petImage, petFace, foodImage, decorImage, rarityOf, foodBag, decorBag, shopGroups, bowlViews, tintFor, arrivalCard, focusOffset, homeView, potLevel, cutoutViews, isNight,
  frontAt, cutoutStrips, BOWL_PX, backdropImage, changedPaths,
}
