// 小动物怎么走（camp-life.js 用）：绕开障碍找路（route）、一小段一小段地走（step / go）、这会儿屏幕上实际在哪（at）、停下（land / halt / put）。
// 每只身上这几样归这里管，别处只读：
//   x / y      这一小段的终点（页面按它摆，CSS 过渡 duration 毫秒走过去）
//   duration   0 = 直接到、不带过渡
//   seg        这一小段从哪儿、什么时候出发、走多久（算「这会儿走到哪儿了」用）
//   depthY     走路时排前后用的 y（这一小段的中点）；停下清掉。在家具上玩的由 camp-life 自己设
// 走的时候顺带改朝向 right / dir。坐标全是画的像素；时钟 now 能注入，测试里手动推进

const { scaleAt, inGrass, segmentHitsPoly, nogoPolys, pointInPoly } = require('./shared/camp')
const { decorById, patchRect, footRect } = require('./shared/decor')
const { facingFor, dirOf } = require('./anim')
const { cutoutStrips } = require('./camp-view')

const PATH_MARGIN = 60 // 绕障碍时离它多远

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)

// 一段路 from → to 跨过哪些东西的那条线（lines：[{ l, r, y }]），返回跨过去的那些点（按先后）。
// 只要这一段路上身子哪儿横着挨着它就算（不只是跨线那一下）：斜着走，跨线时在旁边、走着走着挨上了，也得在跨线处切开，
// 不然后半段按前半段的前后排，走到提灯后面还盖在提灯上面
function depthCuts(from, to, half, lines) {
  const ts = []
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  lines.forEach((o) => {
    if ((from.y - o.y) * (to.y - o.y) >= 0) return
    if (Math.max(from.x, to.x) + half < o.l || Math.min(from.x, to.x) - half > o.r) return
    const t = (o.y - from.y) / (to.y - from.y)
    if (t * len > 1 && (1 - t) * len > 1) ts.push(t)
  })
  ts.sort((p, q) => p - q)
  return ts.map((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, piece: true }))
}

// decor：摆着的装饰 [{ uid, id, x, y }]；sizeOf(a)：这只多宽（画的像素，没按远近缩放）；速度是 a.pet.speed（像素 / 秒）
function createWalk({ decor = [], now = Date.now, sizeOf }) {
  let placed = decor
  let graph = null

  // 绕路：禁区（帐篷、篝火、木盖、提灯）和摆着的装饰的落脚框都是障碍。在每个障碍外面一圈取点，两点之间直线不碰障碍就连上，
  // 走最短的那条（Dijkstra）；图只在装饰变了的时候重算
  function obstacles() {
    const out = nogoPolys().map((poly) => ({ poly }))
    placed.forEach((p) => {
      if (!decorById(p.id)) return
      const r = footRect(p.id, p.x, p.y)
      out.push({ poly: [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]], decor: p.uid })
    })
    out.forEach((o) => {
      const xs = o.poly.map((q) => q[0])
      const ys = o.poly.map((q) => q[1])
      o.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    })
    return out
  }

  function clear(p, q, obs) {
    const l = Math.min(p.x, q.x)
    const r = Math.max(p.x, q.x)
    const t = Math.min(p.y, q.y)
    const b = Math.max(p.y, q.y)
    return !obs.some((o) => !(r < o.box[0] || l > o.box[2] || b < o.box[1] || t > o.box[3]) && segmentHitsPoly([p.x, p.y], [q.x, q.y], o.poly))
  }

  function buildGraph() {
    const obs = obstacles()
    const nodes = []
    obs.forEach((o) => {
      const cx = o.poly.reduce((acc, q) => acc + q[0], 0) / o.poly.length
      const cy = o.poly.reduce((acc, q) => acc + q[1], 0) / o.poly.length
      o.poly.forEach(([x, y]) => {
        const len = Math.hypot(x - cx, y - cy) || 1
        const n = { x: x + ((x - cx) / len) * PATH_MARGIN, y: y + ((y - cy) / len) * PATH_MARGIN }
        if (inGrass(n.x, n.y) && !obs.some((q) => pointInPoly(n.x, n.y, q.poly))) nodes.push(n)
      })
    })
    const edges = nodes.map(() => [])
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (!clear(nodes[i], nodes[j], obs)) continue
        const d = dist(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y)
        edges[i].push([j, d])
        edges[j].push([i, d])
      }
    }
    return { obs, nodes, edges }
  }

  // 从 from 走到 to 的路：[拐点…, to]（最短、不碰障碍）；走不过去返回 null。
  // 起点 / 终点在某件装饰的落脚框里（躺在吊床上、去窝里睡）的，那件这回不算障碍
  function route(from, to) {
    if (!graph) graph = buildGraph()
    const obs = graph.obs.filter((o) => !o.decor || (!pointInPoly(from.x, from.y, o.poly) && !pointInPoly(to.x, to.y, o.poly)))
    if (clear(from, to, obs)) return [to]
    const { nodes, edges } = graph
    const n = nodes.length
    const best = new Array(n).fill(Infinity)
    const prev = new Array(n).fill(-1)
    const done = new Array(n).fill(false)
    const toGoal = new Array(n).fill(Infinity)
    nodes.forEach((nd, i) => {
      if (clear(from, nd, obs)) best[i] = dist(from.x, from.y, nd.x, nd.y)
      if (clear(nd, to, obs)) toGoal[i] = dist(nd.x, nd.y, to.x, to.y)
    })
    let goal = { d: Infinity, via: -1 }
    for (;;) {
      let u = -1
      for (let i = 0; i < n; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i
      if (u < 0 || best[u] >= goal.d) break
      done[u] = true
      if (best[u] + toGoal[u] < goal.d) goal = { d: best[u] + toGoal[u], via: u }
      edges[u].forEach(([v, d]) => {
        if (!done[v] && best[u] + d < best[v]) {
          best[v] = best[u] + d
          prev[v] = u
        }
      })
    }
    if (goal.via < 0) return null
    const path = [to]
    for (let u = goal.via; u >= 0; u = prev[u]) path.unshift({ x: nodes[u].x, y: nodes[u].y })
    return path
  }

  // 会挡住宠物 / 被宠物挡住的东西，各自按一条横线排前后：抠图层（帐篷一条条）、装饰
  const cutLines = cutoutStrips().map((c) => ({ l: c.l, r: c.r, y: c.zy }))
  function occluders() {
    const out = cutLines.slice()
    placed.forEach((p) => {
      if (!decorById(p.id)) return
      const rect = patchRect(p.id, p.x, p.y)
      out.push({ l: rect.left, r: rect.right, y: p.y })
    })
    return out
  }

  // 不管路，直接挪到 to、走 ms 毫秒（爬梯子、滑下来也用）
  function go(a, to, ms) {
    a.seg = { x: a.x, y: a.y, t0: now(), ms }
    a.duration = ms
    a.x = to.x
    a.y = to.y
  }

  // 走 path（route 给的，会从里面取走）的下一小段，返回这一小段走多少毫秒（走完了调 land）。
  // 跨过某样东西的那条线、身子又横着挨着它，就在跨过去的那一点切开：每一小段里和谁前谁后都不变，按这段中点排
  // （不然一出发就按终点排，走到锅后面之前就先钻到锅后面去了）
  function step(a, path) {
    let next = path.shift()
    const half = (sizeOf(a) * scaleAt(Math.max(a.y, next.y))) / 2
    const cuts = depthCuts({ x: a.x, y: a.y }, next, half, occluders())
    if (cuts.length) {
      path.unshift(...cuts.slice(1), { ...next, piece: true })
      next = cuts[0]
    }
    a.right = facingFor(next.x - a.x, a.right)
    a.dir = dirOf(next.x - a.x, next.y - a.y, a.dir)
    // 切开的小段照原来的速度走（不设最短时长，不然走到切点会顿一下）
    const ms = Math.round((dist(a.x, a.y, next.x, next.y) / a.pet.speed) * 1000)
    const depthY = (a.y + next.y) / 2
    go(a, next, next.piece ? Math.max(16, ms) : Math.max(300, ms))
    a.depthY = depthY
    return a.duration
  }

  // 这一小段走完了：之后再挪不带过渡，前后按脚下排
  function land(a) {
    a.seg = null
    a.duration = 0
    a.depthY = null
  }

  // 直接放到 (x, y)，不带过渡（从营地边上进来、回到上次离开的地方）
  function put(a, x, y) {
    a.x = x
    a.y = y
    land(a)
  }

  const moving = (a) => !!a.seg && a.seg.ms > 0 && now() - a.seg.t0 < a.seg.ms

  // 这会儿在屏幕上实际在哪：这一小段按时间线性插值（和 CSS 的 linear 过渡一样）
  function at(a) {
    if (!moving(a)) return { x: a.x, y: a.y }
    const t = Math.max(0, (now() - a.seg.t0) / a.seg.ms)
    return { x: a.seg.x + (a.x - a.seg.x) * t, y: a.seg.y + (a.y - a.seg.y) * t }
  }

  // 走到一半的就停在屏幕上这会儿的位置（不带过渡）；返回停没停（没在走返回 false）
  function halt(a) {
    if (!moving(a)) return false
    const p = at(a)
    put(a, p.x, p.y)
    return true
  }

  // 摆的装饰变了：障碍、挡人的线跟着变
  function update(next) {
    placed = next
    graph = null
  }

  return { route, step, go, land, put, at, halt, update }
}

module.exports = { createWalk, depthCuts }
