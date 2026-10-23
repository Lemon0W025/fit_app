const test = require('node:test')
const assert = require('node:assert/strict')
const { isoLayout, tileCenter } = require('../miniprogram/utils/iso')
const {
  itemImage,
  rarityOf,
  buildScene,
  inventoryList,
  hintTiles,
  collectionGroups,
  arrivalCard,
} = require('../miniprogram/utils/garden-view')

const L = isoLayout(6, 360)

test('itemImage 与 rarityOf', () => {
  assert.equal(itemImage('panda'), '/images/garden/items/panda.png')
  assert.deepEqual(rarityOf('epic'), { id: 'epic', label: '珍稀', color: '#9B5BD6' })
  assert.equal(rarityOf('nope').label, '普通')
})

test('buildScene：按前后顺序排，后面的先画；底部对准格子', () => {
  const placed = [
    { uid: 'a', itemId: 'panda', c: 3, r: 3 },
    { uid: 'b', itemId: 'daisy', c: 0, r: 0 },
    { uid: 'c', itemId: 'starter_tree', c: 1, r: 2 },
    { uid: 'd', itemId: 'gone_item', c: 4, r: 4 },
  ]
  const sprites = buildScene(placed, L)
  assert.deepEqual(sprites.map((s) => s.uid), ['b', 'c', 'a'])
  assert.ok(sprites[0].z < sprites[1].z && sprites[1].z < sprites[2].z)
  const panda = sprites[2]
  assert.equal(panda.name, '大熊猫')
  assert.equal(panda.image, '/images/garden/items/panda.png')
  const center = tileCenter(3, 3, L)
  assert.ok(Math.abs(panda.left + panda.width / 2 - center.x) < 0.01)
  assert.ok(panda.bottom > 0 && panda.bottom < L.height)
  // 大件比小件画得大
  assert.ok(sprites[1].width > sprites[0].width)
})

test('inventoryList：带上名称、图片和稀有度颜色', () => {
  const list = inventoryList([{ itemId: 'panda', count: 2 }, { itemId: 'missing', count: 1 }])
  assert.equal(list.length, 1)
  assert.deepEqual(list[0], {
    itemId: 'panda',
    count: 2,
    name: '大熊猫',
    image: '/images/garden/items/panda.png',
    rarity: 'epic',
    rarityLabel: '珍稀',
    rarityColor: '#9B5BD6',
  })
})

test('hintTiles：标出所有空地，移动时自己原来的位置也算空地', () => {
  const placed = [{ uid: 'a', itemId: 'panda', c: 0, r: 0 }, { uid: 'b', itemId: 'daisy', c: 1, r: 0 }]
  assert.equal(hintTiles(placed, L).length, 34)
  const moving = hintTiles(placed, L, 'a')
  assert.equal(moving.length, 35)
  const first = moving.find((t) => t.c === 0 && t.r === 0)
  assert.equal(first.width, L.tileW)
  assert.equal(first.height, L.tileH)
  assert.equal(first.left, L.originX - L.tileW / 2)
  assert.equal(first.top, L.top)
})

test('collectionGroups：按稀有度分组（不含小动物），再加小动物和节气限定', () => {
  const groups = collectionGroups(['daisy', 'panda', 'snowman', 'osmanthus'])
  assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [
    ['普通', 15], ['稀有', 10], ['珍稀', 6], ['传说', 3], ['小动物', 9], ['节气限定', 5],
  ])
  const daisy = groups[0].items.find((i) => i.id === 'daisy')
  assert.equal(daisy.collected, true)
  assert.equal(groups[0].collectedCount, 1)
  assert.equal(groups[0].items.find((i) => i.id === 'grass').collected, false)
  const animals = groups[4]
  assert.equal(animals.id, 'animals')
  assert.equal(animals.collectedCount, 1)
  assert.equal(animals.items.find((i) => i.id === 'panda').hint, '喜欢：翠竹')
  assert.equal(animals.items.find((i) => i.id === 'panda_family').hint, '喜欢：大熊猫 + 3 丛翠竹')
  assert.equal(groups[0].items[0].hint, '')
  const snowman = groups[5].items.find((i) => i.id === 'snowman')
  assert.equal(snowman.termName, '小雪')
  assert.equal(snowman.collected, true)
})

test('arrivalCard：搬家横幅', () => {
  assert.deepEqual(arrivalCard({ id: 'panda', name: '大熊猫' }), {
    id: 'panda', name: '大熊猫', image: '/images/garden/items/panda.png', text: '大熊猫闻着竹子香，搬进庭院啦！',
  })
  assert.equal(arrivalCard(null), null)
  assert.equal(arrivalCard(undefined), null)
})
