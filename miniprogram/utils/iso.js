// 等距（斜 45° 俯视）网格的坐标换算，单位 px，纯函数（有单测）
// 格子 (c, r)：c 往右下增加，r 往左下增加；(0,0) 在最上面

// 长方形网格：cols 格 × rows 格，每格宽 tileW
function gridLayout(cols, rows, tileW) {
  const tileH = tileW / 2
  const depth = tileH * 0.4 // 地块侧面的厚度
  const top = tileW * 1.3 // 给后排的大树、房子留出往上长的空间
  const width = ((cols + rows) * tileW) / 2
  const landHeight = ((cols + rows) * tileH) / 2 + depth
  return { cols, rows, size: Math.max(cols, rows), tileW, tileH, depth, top, originX: (rows * tileW) / 2, width, landHeight, height: top + landHeight }
}

// 正方形网格：size 格，整体宽 width
function isoLayout(size, width) {
  return gridLayout(size, size, width / size)
}

// 菱形格子的最上面那个顶点
function tileTop(c, r, L) {
  return { x: L.originX + ((c - r) * L.tileW) / 2, y: L.top + ((c + r) * L.tileH) / 2 }
}

function tileCenter(c, r, L) {
  const t = tileTop(c, r, L)
  return { x: t.x, y: t.y + L.tileH / 2 }
}

// 点击坐标（相对容器左上角）反算是哪一格；点在网格外面返回 null
function tileAt(x, y, L) {
  const cols = L.cols || L.size
  const rows = L.rows || L.size
  const dx = (x - L.originX) / (L.tileW / 2)
  const dy = (y - L.top) / (L.tileH / 2)
  const c = Math.floor((dy + dx) / 2)
  const r = Math.floor((dy - dx) / 2)
  if (c < 0 || r < 0 || c >= cols || r >= rows) return null
  return { c, r }
}

module.exports = { gridLayout, isoLayout, tileTop, tileCenter, tileAt }
