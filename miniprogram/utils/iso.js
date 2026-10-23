// 等距（斜 45° 俯视）庭院的坐标换算，单位 px，纯函数（有单测）
// 格子 (c, r)：c 往右下增加，r 往左下增加；(0,0) 在最上面

function isoLayout(size, width) {
  const tileW = width / size
  const tileH = tileW / 2
  const depth = tileH * 0.4 // 地块侧面的厚度
  const top = tileW * 1.3 // 给后排的大树、凉亭留出往上长的空间
  const landHeight = size * tileH + depth
  return { size, width, tileW, tileH, depth, top, originX: width / 2, landHeight, height: top + landHeight }
}

// 菱形格子的最上面那个顶点
function tileTop(c, r, L) {
  return { x: L.originX + ((c - r) * L.tileW) / 2, y: L.top + ((c + r) * L.tileH) / 2 }
}

function tileCenter(c, r, L) {
  const t = tileTop(c, r, L)
  return { x: t.x, y: t.y + L.tileH / 2 }
}

// 点击坐标（相对庭院容器左上角）反算是哪一格；点在地块外面返回 null
function tileAt(x, y, L) {
  const dx = (x - L.originX) / (L.tileW / 2)
  const dy = (y - L.top) / (L.tileH / 2)
  const c = Math.floor((dy + dx) / 2)
  const r = Math.floor((dy - dx) / 2)
  if (c < 0 || r < 0 || c >= L.size || r >= L.size) return null
  return { c, r }
}

module.exports = { isoLayout, tileTop, tileCenter, tileAt }
