// 大地图庭院：布局尺寸、每块地的地面图和开荒木牌、小岛外的装饰、屏幕点按 → 格子（纯函数，有单测）

const { PLOT_SIZE, PLOT_GRID, WORLD_SIZE, canExpand, tileOpen } = require('./shared/garden')
const { isoLayout, tileTop, tileCenter, tileAt } = require('./iso')

// 1 倍时一块地占屏幕宽度的比例；小岛外面留白（装饰、拖到边上时的余地）占屏幕宽度的比例
const PLOT_SCREEN = 0.92
const MARGIN_SCREEN = 0.6

function worldLayout(windowWidth) {
  const tileW = (windowWidth * PLOT_SCREEN) / PLOT_SIZE
  const L = isoLayout(WORLD_SIZE, tileW * WORLD_SIZE)
  const margin = Math.round(windowWidth * MARGIN_SCREEN)
  return { ...L, margin, viewWidth: L.width + margin * 2, viewHeight: L.height + margin * 2 }
}

// movable-view 的位置：地图正中（也就是中间那块地的中心）对准屏幕正中
function centerOffset(L, windowWidth, windowHeight) {
  const middle = WORLD_SIZE / 2
  const p = tileTop(middle, middle, L)
  return { x: windowWidth / 2 - (L.margin + p.x), y: windowHeight / 2 - (L.margin + p.y), scale: 1 }
}

// 每块地一张地面图（带下面的土边），从后往前画：前面的地盖住后面那块的土边，只有小岛外圈露出来
function plotViews(plots, L, cost) {
  const width = L.tileW * PLOT_SIZE
  const height = PLOT_SIZE * L.tileH + L.depth
  const signWidth = L.tileW * 1.4
  const views = []
  for (let pr = 0; pr < PLOT_GRID; pr++) {
    for (let pc = 0; pc < PLOT_GRID; pc++) {
      const key = `${pc},${pr}`
      const open = plots.indexOf(key) !== -1
      const top = tileTop(pc * PLOT_SIZE, pr * PLOT_SIZE, L)
      const middle = tileTop(pc * PLOT_SIZE + PLOT_SIZE / 2, pr * PLOT_SIZE + PLOT_SIZE / 2, L)
      views.push({
        key,
        open,
        z: pc + pr,
        image: open ? '/images/garden/plot-open.png' : '/images/garden/plot-wild.png',
        left: top.x - width / 2,
        top: top.y,
        width,
        height,
        sign: !open && cost != null && canExpand(plots, key)
          ? { left: middle.x - signWidth / 2, bottom: L.height - middle.y, width: signWidth, cost }
          : null,
      })
    }
  }
  return views.sort((a, b) => a.z - b.z)
}

// 小岛外面的装饰（不能点）：枯树、枯灌木、石头和云——外面荒着，衬得院子里有生气。坐标是地图外面的格子，scale 是相对格子宽度的大小
const DECOR = [
  { image: 'decor-deadtree', c: -2, r: 2, scale: 1.6 },
  { image: 'decor-deadbush', c: -2, r: 7, scale: 1.1 },
  { image: 'decor-deadtree', c: -3, r: 12, scale: 2 },
  { image: 'items/pebbles', c: -2, r: 16, scale: 0.9 },
  { image: 'decor-deadtree', c: 3, r: -2, scale: 1.8 },
  { image: 'items/pebbles', c: 9, r: -2, scale: 0.9 },
  { image: 'decor-deadbush', c: 14, r: -2, scale: 1.2 },
  { image: 'decor-deadtree', c: 20, r: 4, scale: 1.7 },
  { image: 'decor-deadbush', c: 20, r: 11, scale: 1.1 },
  { image: 'decor-deadtree', c: 5, r: 20, scale: 1.6 },
  { image: 'decor-deadbush', c: 12, r: 20, scale: 1.2 },
  { image: 'decor-cloud', c: -6, r: 2, scale: 2.4, cloud: true },
  { image: 'decor-cloud', c: 6, r: -7, scale: 2, cloud: true },
]

function decorations(L) {
  return DECOR.map((d, i) => {
    const center = tileCenter(d.c, d.r, L)
    const width = L.tileW * d.scale
    return {
      key: `d${i}`,
      image: `/images/garden/${d.image}.png`,
      left: center.x - width / 2,
      bottom: L.height - center.y,
      width,
      // 小岛后面的画在地面下层，前面的按前后顺序和物件一起排
      z: d.c < 0 || d.r < 0 ? -5 : (d.c + d.r) * 10 + d.c,
      cloud: !!d.cloud,
    }
  })
}

// 屏幕上的点 → 格子；rect 是 #world 此刻在屏幕上的位置和宽度（已经算上拖动和缩放）
function tileFromTouch(x, y, rect, L) {
  const scale = rect.width / L.width
  return tileAt((x - rect.left) / scale, (y - rect.top) / scale, L)
}

function openChecker(plots) {
  return (c, r) => tileOpen(plots, c, r)
}

module.exports = { worldLayout, centerOffset, plotViews, decorations, tileFromTouch, openChecker }
