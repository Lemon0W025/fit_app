// 环形进度（首页热量卡）：圆环 = 今天吃了每日预算的多少，中间大字是已吃的千卡，下面一行「还能吃 M」或「超了 M」。
// 数字和圆环共用一个动画进度：value 变了就从现在显示的数先快后慢滚到新数（utils/fx.js 的 countUp，定时器走 this.clock），
// 不归零重播；滚到一半又来了新数，从当前显示的数接着滚。页面藏起来就直接跳到最后的数，不留定时器。
// 圆环是两个半圆各自 rotate（纯 CSS、只动 transform）；超过预算画满、换提醒色（over 也能直接要提醒色）
const { clockOf, countUp } = require('../../utils/fx')

const ROLL_MS = 800

// 显示 shown 千卡、预算 max 时圆环的样子：右半边从 12 点顺时针走到 6 点，过了一半左半边再从 6 点走回 12 点。
// 每个半圆在 -135° 时整个藏在另一边，转到 45° 正好盖满自己这半边
function ringView(shown, max, over) {
  const p = max > 0 ? Math.max(0, Math.min(1, shown / max)) : 0
  let sub = ''
  if (max > 0) sub = shown > max ? `超了 ${shown - max}` : `还能吃 ${max - shown}`
  return {
    percent: Math.round(p * 100),
    right: -135 + 360 * Math.min(p, 0.5),
    left: -135 + 360 * Math.max(0, p - 0.5),
    rightOn: p > 0,
    leftOn: p > 0.5,
    full: p >= 1,
    warn: !!over || (max > 0 && shown > max),
    sub,
  }
}

Component({
  properties: {
    value: { type: Number, value: 0 },
    max: { type: Number, value: 0 },
    size: { type: Number, value: 300 },
    over: { type: Boolean, value: false },
  },

  data: {
    shown: 0,
    ...ringView(0, 0, false),
  },

  observers: {
    value() {
      this.roll()
    },
    'max, over'() {
      this.paint(this.data.shown)
    },
  },

  lifetimes: {
    attached() {
      this.roll()
    },
    detached() {
      this.stop()
    },
  },

  pageLifetimes: {
    hide() {
      this.finish()
    },
  },

  methods: {
    // 从现在显示的数滚到 value；同一个目标不重来
    roll() {
      const to = Math.max(0, Math.round(Number(this.data.value) || 0))
      if (to === this.target) return
      this.target = to
      this.stop()
      this.counter = countUp(this.data.shown, to, ROLL_MS, (n) => this.paint(n), clockOf(this))
    },

    paint(n) {
      this.setData({ shown: n, ...ringView(n, this.data.max, this.data.over) })
    },

    // 跳到最后的数
    finish() {
      if (this.counter) this.counter.finish()
      this.counter = null
    },

    // 停在当前显示的数
    stop() {
      if (this.counter) this.counter.cancel()
      this.counter = null
    },
  },
})
