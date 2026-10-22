// 体重折线图：computeChart 负责算坐标（纯函数，有单测），drawChart 负责画到 canvas 2d 上

// 目标离曲线超过这么多公斤就先不画目标线，否则曲线会被压成一条平线，看不出变化
const TARGET_NEAR_KG = 2

function computeChart(values, { width, height, padding = 24, target = null }) {
  if (!values.length) return { points: [], min: 0, max: 0, targetY: null }

  let min = Math.min(...values)
  let max = Math.max(...values)
  if (target != null && (target < min - TARGET_NEAR_KG || target > max + TARGET_NEAR_KG)) {
    target = null
  }
  if (target != null) {
    min = Math.min(min, target)
    max = Math.max(max, target)
  }
  // 数值几乎不变时撑开 ±1kg，避免折线贴死在一条线上或除以零
  if (max - min < 1) {
    const mid = (max + min) / 2
    min = mid - 1
    max = mid + 1
  }
  const headroom = (max - min) * 0.1
  min -= headroom
  max += headroom

  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const y = (v) => padding + ((max - v) / (max - min)) * innerH
  const points = values.map((value, i) => ({
    x: values.length === 1 ? width / 2 : padding + (innerW * i) / (values.length - 1),
    y: y(value),
    value,
  }))
  return { points, min, max, targetY: target == null ? null : y(target) }
}

function drawChart(ctx, chart, { width, height, padding, colors }) {
  ctx.clearRect(0, 0, width, height)
  if (!chart.points.length) return

  ctx.font = '11px sans-serif'
  ctx.lineWidth = 1
  for (let i = 0; i <= 2; i++) {
    const y = padding + ((height - padding * 2) * i) / 2
    const value = chart.max - ((chart.max - chart.min) * i) / 2
    ctx.strokeStyle = colors.grid
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(width - padding, y)
    ctx.stroke()
    // 目标线贴得太近时省掉这条刻度文字，避免重叠
    if (chart.targetY == null || Math.abs(y - chart.targetY) > 16) {
      ctx.fillStyle = colors.text
      ctx.fillText(value.toFixed(1), padding, y - 4)
    }
  }

  if (chart.targetY != null) {
    ctx.strokeStyle = colors.target
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(padding, chart.targetY)
    ctx.lineTo(width - padding, chart.targetY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = colors.target
    ctx.fillText('目标', width - padding - 24, chart.targetY - 4)
  }

  ctx.strokeStyle = colors.line
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.beginPath()
  chart.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()

  ctx.fillStyle = colors.line
  chart.points.forEach((p) => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
    ctx.fill()
  })

  // 最新值标在折线来向的另一侧，避免压在线上
  const last = chart.points[chart.points.length - 1]
  const prev = chart.points[chart.points.length - 2]
  const labelY = prev && prev.y < last.y ? last.y + 18 : last.y - 10
  ctx.fillStyle = colors.text
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText(String(last.value), Math.min(last.x - 12, width - padding - 30), labelY)
}

module.exports = { computeChart, drawChart }
