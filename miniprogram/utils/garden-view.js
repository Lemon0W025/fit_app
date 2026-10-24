// 庭院、背包、图鉴的展示数据整理（纯函数，有单测）

const { ITEMS, RARITIES, SOLAR_TERMS, itemById } = require('./shared/garden')
const { tileTop, tileCenter } = require('./iso')
const { ANIMAL_INFO } = require('./animals')

// 物品在庭院里的宽度（相对格子宽度）
const SIZE_SCALE = { s: 0.8, m: 1.0, l: 1.3 }
// 2×2 大件的宽度（相对格子宽度）
const FOOT2_SCALE = 2.2
// 脚下的接触阴影：宽是图宽的 0.55、很扁，紧贴底边（椭圆再大就像悬空）
const SHADOW_RATIO = 0.55
// 图底边比格子中心再往下多少（格高）：物件的底座要盖住菱形的前半，才像长在地里；2×2 的按四格的大菱形算
const SINK = { 1: 0.42, 2: 0.9 }

// 物件的落点：1 格的在格子中心，2×2 的在四格中间（正好是左前角那格的顶点）；y 是图底边（比落点再往下一点，像踩在地上）
function itemAnchor(p, L) {
  const item = itemById(p.itemId)
  const foot = item && item.foot === 2 ? 2 : 1
  const width = L.tileW * (foot === 2 ? FOOT2_SCALE : SIZE_SCALE[item ? item.size : 'm'])
  const base = foot === 2 ? tileTop(p.c, p.r, L) : tileCenter(p.c, p.r, L)
  return { x: base.x, y: base.y + L.tileH * SINK[foot], width, foot }
}

// 影子的位置（x、y 是图底边中点，和 itemAnchor 一样的坐标系）
function shadowOf(x, y, width, L) {
  const w = width * SHADOW_RATIO
  const h = w / 3
  return { left: x - w / 2, bottom: L.height - y - h / 2, width: w, height: h }
}

// 拖着走的幽灵图：和摆下去一样宽
function ghostWidth(itemId, L) {
  return itemAnchor({ itemId, c: 0, r: 0 }, L).width
}

function itemImage(id) {
  return `/images/garden/items/${id}.png`
}

function rarityOf(id) {
  const r = RARITIES.find((x) => x.id === id) || RARITIES[0]
  return { id: r.id, label: r.label, color: r.color }
}

// 花园里摆的东西：按前后排序（后排先画），图底边对准落点；2×2 的按左前角那格排前后
function buildScene(placed, L) {
  return placed
    .map((p) => ({ p, item: itemById(p.itemId) }))
    .filter((x) => x.item)
    .map(({ p, item }) => {
      const a = itemAnchor(p, L)
      // 只能放水里的东西（荷花丛、锦鲤群…）：没有影子，脚下一圈涟漪
      const water = Array.isArray(item.ground) && item.ground.length === 1 && item.ground[0] === 'water'
      return {
        uid: p.uid,
        itemId: p.itemId,
        c: p.c,
        r: p.r,
        foot: a.foot,
        flip: !!p.flip,
        water,
        name: item.name,
        image: itemImage(item.id),
        width: a.width,
        left: a.x - a.width / 2,
        bottom: L.height - a.y,
        shadow: water ? null : shadowOf(a.x, a.y, a.width, L),
        ripple: water ? { left: a.x - a.width * 0.45, bottom: L.height - a.y - a.width * 0.08, width: a.width * 0.9, height: a.width * 0.22 } : null,
        z: (p.c + p.r) * 10 + p.c,
      }
    })
    .sort((a, b) => a.z - b.z)
}

function inventoryList(inventory) {
  return inventory
    .map(({ itemId, count }) => {
      const item = itemById(itemId)
      if (!item) return null
      const rarity = rarityOf(item.rarity)
      return {
        itemId,
        count,
        name: item.name,
        image: itemImage(itemId),
        rarity: rarity.id,
        rarityLabel: rarity.label,
        rarityColor: rarity.color,
      }
    })
    .filter(Boolean)
}

function termName(key) {
  const t = SOLAR_TERMS.find((x) => x.key === key)
  return t ? t.name : ''
}

function collectionGroups(collected) {
  const has = (id) => collected.indexOf(id) !== -1
  const isAnimal = (i) => i.kind === 'animal'
  const toEntry = (i) => ({
    id: i.id,
    name: i.name,
    image: itemImage(i.id),
    collected: has(i.id),
    termName: i.term ? termName(i.term) : '',
    hint: isAnimal(i) ? ANIMAL_INFO[i.id].likesText : '',
  })
  const groups = RARITIES.map((r) => ({
    id: r.id,
    label: r.label,
    color: r.color,
    items: ITEMS.filter((i) => i.rarity === r.id && !i.starter && !i.term && !isAnimal(i)).map(toEntry),
  }))
  groups.push({ id: 'animals', label: '小动物', color: '#4E7D5B', items: ITEMS.filter(isAnimal).map(toEntry) })
  groups.push({ id: 'seasonal', label: '节气限定', color: '#D97A1E', items: ITEMS.filter((i) => i.term).map(toEntry) })
  return groups.map((g) => ({ ...g, collectedCount: g.items.filter((i) => i.collected).length }))
}

// 打卡结果页的搬家横幅
function arrivalCard(arrival) {
  if (!arrival) return null
  return { id: arrival.id, name: arrival.name, image: itemImage(arrival.id), text: ANIMAL_INFO[arrival.id].arrive }
}

module.exports = { SIZE_SCALE, FOOT2_SCALE, itemImage, rarityOf, itemAnchor, ghostWidth, shadowOf, buildScene, inventoryList, collectionGroups, arrivalCard }
