// 庭院、背包、图鉴的展示数据整理（纯函数，有单测）

const { ITEMS, RARITIES, SOLAR_TERMS, itemById } = require('./shared/garden')
const { tileTop, tileCenter } = require('./iso')

// 物品在庭院里的宽度（相对格子宽度）
const SIZE_SCALE = { s: 0.8, m: 1.0, l: 1.3 }

function itemImage(id) {
  return `/images/garden/items/${id}.png`
}

function rarityOf(id) {
  const r = RARITIES.find((x) => x.id === id) || RARITIES[0]
  return { id: r.id, label: r.label, color: r.color }
}

// 庭院里摆的东西：按前后排序（后排先画），图片底边对准格子中心稍靠下的位置
function buildScene(placed, L) {
  return placed
    .map((p) => ({ p, item: itemById(p.itemId) }))
    .filter((x) => x.item)
    .map(({ p, item }) => {
      const width = L.tileW * SIZE_SCALE[item.size]
      const center = tileCenter(p.c, p.r, L)
      return {
        uid: p.uid,
        itemId: p.itemId,
        c: p.c,
        r: p.r,
        name: item.name,
        image: itemImage(item.id),
        width,
        left: center.x - width / 2,
        bottom: L.height - (center.y + L.tileH * 0.18),
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

// 摆放、移动时可以点的空地（移动时自己原来的位置也算空地）
function hintTiles(placed, L, ignoreUid) {
  const taken = {}
  placed.forEach((p) => {
    if (p.uid !== ignoreUid) taken[`${p.c},${p.r}`] = true
  })
  const tiles = []
  for (let c = 0; c < L.size; c++) {
    for (let r = 0; r < L.size; r++) {
      if (taken[`${c},${r}`]) continue
      const t = tileTop(c, r, L)
      tiles.push({ key: `${c}-${r}`, c, r, left: t.x - L.tileW / 2, top: t.y, width: L.tileW, height: L.tileH })
    }
  }
  return tiles
}

function termName(key) {
  const t = SOLAR_TERMS.find((x) => x.key === key)
  return t ? t.name : ''
}

function collectionGroups(collected) {
  const has = (id) => collected.indexOf(id) !== -1
  const toEntry = (i) => ({ id: i.id, name: i.name, image: itemImage(i.id), collected: has(i.id), termName: i.term ? termName(i.term) : '' })
  const groups = RARITIES.map((r) => ({
    id: r.id,
    label: r.label,
    color: r.color,
    items: ITEMS.filter((i) => i.rarity === r.id && !i.starter && !i.term).map(toEntry),
  }))
  groups.push({ id: 'seasonal', label: '节气限定', color: '#D97A1E', items: ITEMS.filter((i) => i.term).map(toEntry) })
  return groups.map((g) => ({ ...g, collectedCount: g.items.filter((i) => i.collected).length }))
}

module.exports = { itemImage, rarityOf, buildScene, inventoryList, hintTiles, collectionGroups }
