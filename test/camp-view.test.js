// test/camp-view.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const V = require('../miniprogram/utils/camp-view')
const { W, H, scaleAt, SCENE } = require('../miniprogram/utils/shared/camp')
const { decorById } = require('../miniprogram/utils/shared/decor')

const WIN = { width: 375, height: 736 }
const L = V.campLayout(WIN)

test('campLayout：整个世界 = 营地画 + 上面的天空 + 下面的草地；1 倍是默认视角，捏小到全景（整幅宽度）也盖满屏幕', () => {
  const { top, bottom } = SCENE.frame
  assert.equal(L.W, W)
  assert.ok(Math.abs(L.k - (0.72 * WIN.height) / H) < 1e-12) // 默认视角：画的高度铺满屏幕的 0.72 倍（锅比以前小）
  assert.equal(L.width, W * L.k)
  assert.equal(L.height, H * L.k)
  assert.equal(L.top, top * L.k)
  assert.equal(L.worldWidth, W * L.k)
  assert.equal(L.worldHeight, (H + top + bottom) * L.k)
  // 1 倍、全景、最大都盖满屏幕；全景正好看到整幅宽度
  for (const s of [1, L.minScale, L.maxScale]) assert.ok(L.worldWidth * s >= WIN.width - 0.01 && L.worldHeight * s >= WIN.height - 0.01, `×${s}`)
  assert.ok(L.minScale < 1 && Math.abs(L.worldWidth * L.minScale - WIN.width) < 1)
  assert.ok(Math.abs(L.maxScale * L.k - (2 * WIN.height) / H) < 0.01) // 最多放大到以前最大那么细
  // 横着拿 / 方屏也盖满
  for (const win of [{ width: 900, height: 400 }, { width: 500, height: 500 }, { width: 360, height: 800 }]) {
    const l = V.campLayout(win)
    assert.ok(l.worldWidth * l.minScale >= win.width - 0.01 && l.worldHeight * l.minScale >= win.height - 0.01, JSON.stringify(win))
  }
  assert.deepEqual(V.toScreen(W, H, L), { x: L.width, y: L.height })
  const rect = { left: -100, top: 20, width: L.width * 2, height: L.height * 2 }
  assert.deepEqual(V.fromTouch(-100 + L.width, 20 + L.height, rect, L), { x: W / 2, y: H / 2 })
})

test('baseTiles：16 块拼满整张画', () => {
  const tiles = V.baseTiles(L, 'cloud://x/camp/base/')
  assert.equal(tiles.length, 16)
  assert.equal(tiles[0].image, 'cloud://x/camp/base/t00.jpg')
  assert.equal(tiles[15].image, 'cloud://x/camp/base/t33.jpg')
  assert.equal(V.baseTiles(L, 'cloud://x/camp/base/')[5].image, 'cloud://x/camp/base/t11.jpg')
  // 没有云端切块就不铺，只剩包里的垫图
  assert.deepEqual(V.baseTiles(L, ''), [])
  assert.equal(V.backdropImage(false), '/images/camp/base/world.jpg')
  assert.equal(V.backdropImage(true), '/images/camp/base/night-world.jpg')
  assert.ok(Math.abs(tiles[15].left + tiles[15].width - L.width) < 1e-6)
  assert.ok(Math.abs(tiles[15].top + tiles[15].height - L.height) < 1e-6)
})

test('frameTiles：上面天空两行、下面草地两行，铺满营地画以外的世界；草地第一行盖住画最下面发虚的那段', () => {
  const { top, overlap } = SCENE.frame
  const tiles = V.frameTiles(L, 'cloud://x/camp/base/', true)
  assert.equal(tiles.length, 16)
  assert.deepEqual(tiles.map((t) => t.key).filter((k, i) => i % 4 === 0), ['u00', 'u10', 'd00', 'd10'])
  assert.equal(tiles[0].image, 'cloud://x/camp/base/night-u00.jpg')
  assert.deepEqual(V.frameTiles(L, ''), [])
  const near = (a, b) => Math.abs(a - b) < 0.02
  const rows = [0, 4, 8, 12].map((i) => tiles[i])
  assert.ok(near(rows[0].top, 0) && near(rows[1].top + rows[1].height, L.top)) // 天空接到营地画顶
  assert.ok(near(rows[2].top, L.top + (H - overlap) * L.k)) // 草地从画里面 overlap 处盖上去
  assert.ok(near(rows[3].top + rows[3].height, L.worldHeight)) // 一直铺到世界最下面
  assert.ok(near(tiles[3].left + tiles[3].width, L.worldWidth))
})

test('decorViews：按远近缩放、锚点对准落脚点、后面的先画', () => {
  const views = V.decorViews([{ uid: 'd2', id: 'ball', x: 1500, y: 3000 }, { uid: 'd1', id: 'tent', x: 1000, y: 1500 }], L, '')
  assert.deepEqual(views.map((v) => v.uid), ['d1', 'd2'])
  const tent = decorById('tent')
  const s = scaleAt(1500)
  assert.ok(Math.abs(views[0].width - tent.patch.w * s * L.k) < 0.011) // 视图值四舍五入到 0.01
  assert.ok(Math.abs(views[0].left - (1000 - tent.anchor.x * s) * L.k) < 0.011)
  assert.ok(Math.abs(views[0].top - (1500 - tent.anchor.y * s) * L.k) < 0.011)
  assert.equal(views[0].image, '/images/camp/decor/tent.png')
  assert.equal(views[0].z, V.Z_DECOR + Math.round(1500 / 4))
  assert.ok(views[1].z > views[0].z)
  assert.equal(V.decorViews([{ uid: 'x', id: 'nope', x: 1, y: 1 }], L, '').length, 0)
  // 云端只有画好了的（utils/decor-art.js 列的）高清块，还没画的用包里的占位
  const drawn = V.decorViews([{ uid: 'a', id: 'tent', x: 1000, y: 1500 }, { uid: 'b', id: 'hammock', x: 2000, y: 1500 }], L, 'cloud://x/camp/decor/')
  assert.equal(drawn.find((v) => v.id === 'tent').image, 'cloud://x/camp/decor/tent.png')
  assert.equal(drawn.find((v) => v.id === 'hammock').image, '/images/camp/decor/hammock.png')
  const ghost = V.ghostView('ball', 1500, 3000, L, false)
  assert.equal(ghost.ok, false)
  assert.ok(ghost.foot.width > 0 && ghost.width > ghost.foot.width)
})

test('背包、商店、食盆、色调、横幅', () => {
  assert.deepEqual(V.foodBag([{ id: 'xiaomi', count: 2 }, { id: 'jiaozi', count: 1 }]).map((f) => [f.name, f.count, f.rarityLabel, f.term]), [['小米', 2, '普通', ''], ['饺子', 1, '稀有', 'dongzhi']])
  assert.equal(V.foodBag([{ id: 'xiaomi', count: 1 }])[0].image, '/images/camp/foods/xiaomi.png')
  assert.deepEqual(V.decorBag([{ id: 'ball', count: 1 }])[0], { id: 'ball', name: '滚球', count: 1, image: '/images/camp/decor/ball.png', category: 'play' })
  const groups = V.shopGroups({ ball: 1, flowerbed: 3 }, 50)
  assert.deepEqual(groups.map((g) => g.id), ['nest', 'eat', 'play', 'plant', 'mood'])
  const ball = groups[2].items.find((i) => i.id === 'ball')
  assert.deepEqual([ball.have, ball.soldOut, ball.canAfford], [1, true, true])
  const tent = groups[0].items.find((i) => i.id === 'tent')
  assert.deepEqual([tent.have, tent.soldOut, tent.canAfford], [0, false, false])
  assert.equal(groups[3].items.find((i) => i.id === 'flowerbed').soldOut, true)
  assert.ok(!groups.some((g) => g.items.some((i) => i.id === 'gold_tent')))
  const bowls = V.bowlViews([{ food: 'xiaomi', peeking: 'doudou' }, { food: null, peeking: null }], L)
  assert.deepEqual([bowls[0].index, bowls[0].foodImage, bowls[0].peekImage, bowls[1].foodImage], [0, '/images/camp/foods/bowl/xiaomi.png', '/images/camp/pets/doudou-face.png', ''])
  // 碗：框按 SCENE.bowl.boxes 摆；吃的画在碗口那圈里；碗沿兜底用包里的 PNG、云端用 WebP、夜里加 night-
  const [bl, bt, br, bb] = SCENE.bowl.boxes[0]
  assert.ok(Math.abs(bowls[0].left - bl * L.k) < 0.011 && Math.abs(bowls[0].width - (br - bl) * L.k) < 0.011 && Math.abs(bowls[0].height - (bb - bt) * L.k) < 0.011)
  assert.ok(Math.abs(bowls[0].pile.width - 2 * SCENE.bowl.rx * L.k) < 0.011)
  assert.ok(Math.abs(bowls[0].left + bowls[0].pile.left + bowls[0].pile.width / 2 - SCENE.bowls[0][0] * L.k) < 0.03)
  assert.equal(bowls[0].rimImage, '/images/camp/cut/bowl-0.png')
  assert.equal(V.bowlViews([], L, true, 'cloud://x/')[1].rimImage, 'cloud://x/night-bowl-1.webp')
  assert.equal(V.bowlViews([], L, true, 'cloud://x/', false)[1].rimImage, 'cloud://x/night-bowl-1-off.webp')
  assert.equal(V.bowlViews([], L, false, '', false)[0].rimImage, '/images/camp/cut/bowl-0.png')
  assert.notEqual(V.bowlViews([], L, true, '', false)[0].light, V.bowlViews([], L, true, '')[0].light)
  assert.deepEqual([6, 12, 17, 18, 19, 23, 3].map(V.tintFor), ['', '', 'dusk', 'dusk', '', '', ''])
  assert.deepEqual([6, 12, 18, 19, 23, 3, 5].map(V.isNight), [false, false, false, true, true, true, true])
  assert.equal(V.baseTiles(L, 'cloud://x/camp/base/', true)[15].image, 'cloud://x/camp/base/night-t33.jpg')
  assert.deepEqual(V.arrivalCard({ id: 'nuonuo', name: '糯糯', foodId: 'huluobo', foodName: '胡萝卜' }), { image: '/images/camp/pets/nuonuo.png', text: '糯糯闻着胡萝卜的香味，搬进营地啦！' })
  assert.deepEqual(V.arrivalCard({ id: null, ate: 'doudou', foodId: 'xiaomi', foodName: '小米' }), { image: '/images/camp/pets/doudou.png', text: '豆豆把食盆里的小米吃了，营地里没有别的小动物爱吃它啦' })
  assert.equal(V.arrivalCard(null), null)
  // 对准营地画上一点：x / y 是缩放后整个世界的左上角在屏幕上的位置（营地画在世界里往下挪了 top）；推到边上的拉回来
  const fmt = (n) => Math.round(n * 100) / 100
  assert.deepEqual(V.focusOffset(W / 2, H / 2, L, WIN), { x: fmt(WIN.width / 2 - L.width / 2), y: fmt(WIN.height / 2 - L.top - L.height / 2), scale: 1 })
  assert.deepEqual(V.focusOffset(0, -SCENE.frame.top, L, WIN), { x: 0, y: 0, scale: 1 })
  assert.deepEqual(V.focusOffset(W / 2, H / 2, L, WIN, 2), { x: fmt(WIN.width / 2 - L.width), y: fmt(WIN.height / 2 - 2 * (L.top + L.height / 2)), scale: 2 })
  // 不管对准哪儿、几倍（全景到最大），世界都盖满屏幕
  for (const [x, y, s] of [[0, 0, 1], [W, H, 1], [W / 2, H / 2, 2], [0, H, 2], [W, 0, 1.5], [SCENE.fire[0], SCENE.fire[1], 1.3], [W / 2, H / 2, L.minScale], [0, -2048, L.minScale], [W, H + 2048, L.maxScale]]) {
    const v = V.focusOffset(x, y, L, WIN, s)
    assert.ok(v.x <= 0 && v.x + s * L.worldWidth >= WIN.width - 0.02, `x ${x},${y} × ${s}`)
    assert.ok(v.y <= 0 && v.y + s * L.worldHeight >= WIN.height - 0.02, `y ${x},${y} × ${s}`)
  }
  // 默认视角：1 倍、篝火（暖暖锅）横着在屏幕正中、营地画竖着居中
  const home = V.homeView(L, WIN)
  assert.equal(home.scale, 1)
  assert.ok(Math.abs(home.x + SCENE.fire[0] * L.k - WIN.width / 2) < 0.01)
  assert.ok(Math.abs(home.y + L.top + L.height / 2 - WIN.height / 2) < 0.01)
  // 暖暖锅：按今天有状态的印章数算层数，0 层不显示
  assert.equal(V.potLevel(null), 0)
  assert.equal(V.potLevel({ stamps: [{ state: 'none' }, { state: 'green' }, { state: 'yellow' }] }), 2)
  assert.equal(V.potLevel({ stamps: [{ state: 'green' }, { state: 'green' }, { state: 'red' }] }), 3)
})

test('抠图层：锅按层数换图；云端 WebP、包里 PNG；帐篷竖着切成条，每条按自己那段前沿排', () => {
  const cuts = V.cutoutViews(L, 2, '')
  const by = (list, key) => list.find((c) => c.key === key)
  assert.equal(by(cuts, 'pot').image, '/images/camp/cut/pot-2.png')
  assert.equal(by(V.cutoutViews(L, 0, ''), 'pot').image, '/images/camp/cut/pot-0.png')
  assert.equal(by(V.cutoutViews(L, 9, 'cloud://x/camp/cut/'), 'pot').image, 'cloud://x/camp/cut/pot-3.webp')
  assert.deepEqual(['tent-0', 'pot'].map((k) => by(V.cutoutViews(L, 1, '', true), k).image), ['/images/camp/cut/night-tent.png', '/images/camp/cut/night-pot-1.png'])
  assert.equal(by(V.cutoutViews(L, 1, 'cloud://x/', true), 'lantern').image, 'cloud://x/night-lantern.webp')
  // 锅是空的火不烧：夜里木盖换熄了火的那张（原来被篝火照成暖黄）；白天、打过卡的照旧
  assert.equal(by(V.cutoutViews(L, 0, 'cloud://x/', true), 'lid').image, 'cloud://x/night-lid-off.webp')
  assert.equal(by(V.cutoutViews(L, 1, 'cloud://x/', true), 'lid').image, 'cloud://x/night-lid.webp')
  assert.equal(by(V.cutoutViews(L, 0, 'cloud://x/'), 'lid').image, 'cloud://x/lid.webp')
  assert.equal(by(V.cutoutViews(L, 0, '', true), 'lantern').image, '/images/camp/cut/night-lantern.png')
  // 锅、木盖、提灯各一整块：图不挪、宽度就是框宽
  ;['pot', 'lid', 'lantern'].forEach((key) => {
    const c = by(cuts, key)
    const [l, t, r, b] = SCENE.cutouts[key].box
    assert.ok(Math.abs(c.left - l * L.k) < 0.011 && Math.abs(c.width - (r - l) * L.k) < 0.011 && Math.abs(c.top - t * L.k) < 0.011 && Math.abs(c.height - (b - t) * L.k) < 0.011, key)
    assert.equal(c.imgLeft, 0)
    assert.equal(c.imgWidth, c.width)
    assert.equal(c.z, V.zOf(SCENE.cutouts[key].zy) + 1)
  })
  // 帐篷的条：首尾相接盖满整个框，都用同一张图、图往左挪到对齐
  const tent = SCENE.cutouts.tent
  const strips = V.cutoutStrips().filter((s) => s.cut === 'tent')
  assert.equal(strips.length, Math.ceil((tent.box[2] - tent.box[0]) / tent.strip))
  assert.equal(strips[0].l, tent.box[0])
  assert.equal(strips[strips.length - 1].r, tent.box[2])
  strips.forEach((s, i) => {
    if (i) assert.equal(s.l, strips[i - 1].r)
    const v = by(cuts, s.key)
    assert.equal(v.image, '/images/camp/cut/tent.png')
    assert.ok(Math.abs(v.left - s.l * L.k) < 0.011 && Math.abs(v.left + v.imgLeft - tent.box[0] * L.k) < 0.03, s.key)
    assert.ok(Math.abs(v.imgWidth - (tent.box[2] - tent.box[0]) * L.k) < 0.011)
    // 每条按它那段前沿最靠上的点排
    assert.ok(s.zy <= V.frontAt(tent.front, s.l) + 0.5 && s.zy <= V.frontAt(tent.front, s.r) + 0.5, s.key)
  })
  // 帐篷门口睡觉的点：盖在挨着的每一条帐篷上面（不会被门帘挡住半个身子）
  SCENE.tent.spots.forEach(([x, y]) => {
    strips.filter((s) => s.l < x + 160 && s.r > x - 160).forEach((s) => assert.ok(V.zOf(y) + 1 > V.zOf(s.zy) + 1, `spot ${x},${y} vs ${s.key}`))
  })
  // 锅后面的点被锅挡住，锅前面的点盖在锅上面
  assert.ok(V.zOf(2400) + 1 < by(cuts, 'pot').z)
  assert.ok(V.zOf(3150) + 1 > by(cuts, 'pot').z)
  // 前沿折线：两头以外按端点，中间线性
  assert.equal(V.frontAt([[0, 10], [100, 30]], -5), 10)
  assert.equal(V.frontAt([[0, 10], [100, 30]], 50), 20)
  assert.equal(V.frontAt([[0, 10], [100, 30]], 500), 30)
})
