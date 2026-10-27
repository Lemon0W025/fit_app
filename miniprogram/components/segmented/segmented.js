// 分段控制器：选中的底色是一块会滑的胶囊。点新选项时胶囊先朝那边伸长（盖住旧的到新的，领头那边快），
// 再收到新选项的宽度（跟着那边慢一点、带一点回弹），两段合起来约 320ms。只动 transform：胶囊拆成左圆头 + 中间一段 + 右圆头，
// 两个圆头只平移、中间那段 translateX + scaleX 拉到要的宽（圆角不会被拉扁）；宽度按量出来的每个选项的实际宽度，字数不同也对得上。
// 连着快点：CSS 过渡被打断会从当前位置转向新目标，这里只管把目标给对。还没量好（或量不到）时，选中的那项自己带底色
const { clockOf } = require('../../utils/fx')

const STRETCH_MS = 130 // 第一段：伸过去（第二段 190ms 在 wxss 里）
const MID_W = 100 // 中间那段的本来宽度（px），scaleX 按它算

const round = (n, k = 100) => Math.round(n * k) / k

// 胶囊盖住 box（相对控件左上角的 left / right / top / height，px）时三块的位置
function pillAt(box) {
  const h = box.height
  return {
    top: round(box.top),
    h: round(h),
    l: round(box.left),
    m: round(box.left + h / 2),
    s: round(Math.max(0, box.right - box.left - h) / MID_W, 10000),
    r: round(box.right - h),
  }
}

// 从 from 去 to 的第一段：把两个都盖住
function cover(from, to) {
  return { left: Math.min(from.left, to.left), right: Math.max(from.right, to.right), top: to.top, height: to.height }
}

function indexOf(options, value) {
  return (options || []).findIndex((o) => o.value === value)
}

Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: null, value: '' },
  },

  data: {
    active: -1,
    ready: false,
    phase: 0,
    pill: { top: 0, h: 0, l: 0, m: 0, s: 0, r: 0 },
  },

  observers: {
    value(value) {
      const i = indexOf(this.data.options, value)
      if (i !== -1 && i !== this.data.active) this.go(i)
    },
    options() {
      this.setData({ active: indexOf(this.data.options, this.data.value) })
      if (this.alive) this.measure()
    },
  },

  lifetimes: {
    attached() {
      this.alive = true
      this.setData({ active: indexOf(this.data.options, this.data.value) })
    },
    ready() {
      this.measure()
    },
    detached() {
      this.alive = false
      this.clearTimer()
    },
  },

  methods: {
    // 量每个选项在控件里的位置；量好了胶囊直接放到选中的那项上（不带过渡）。
    // 还没显示出来（比如在没打开的抽屉里）量到的是空的或 0 宽，不算，等手指碰到时再量
    measure() {
      this.createSelectorQuery()
        .select('.seg')
        .boundingClientRect()
        .selectAll('.seg-opt')
        .boundingClientRect()
        .exec((res) => {
          const box = res && res[0]
          const opts = res && res[1]
          if (!this.alive || !box || !(box.width > 0) || !opts || !opts.length || opts.some((r) => !r || !(r.width > 0))) return
          this.rects = opts.map((r) => ({ left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, height: r.height }))
          this.clearTimer()
          const at = this.rects[this.data.active]
          this.box = at || null
          this.setData(at ? { ready: true, phase: 0, pill: pillAt(at) } : { ready: false })
        })
    },

    // 手指刚碰到：还没量好就现在量（等 tap 来的时候已经量好了，第一下也能滑）
    onTouch() {
      if (!this.data.ready) this.measure()
    },

    onTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      const option = this.data.options[index]
      if (!option || index === this.data.active) return
      this.go(index)
      this.triggerEvent('change', { value: option.value })
    },

    // 胶囊去第 index 项：先伸过去盖住两头，再收到它身上
    go(index) {
      this.clearTimer()
      const to = this.rects && this.rects[index]
      if (!to) {
        this.setData({ active: index })
        return
      }
      // 量好了但胶囊还没出来过（原来选的不在选项里）：直接放上去
      if (!this.data.ready || !this.box) {
        this.box = to
        this.setData({ active: index, ready: true, phase: 0, pill: pillAt(to) })
        return
      }
      const wide = cover(this.box, to)
      this.box = wide
      this.setData({ active: index, phase: 1, pill: pillAt(wide) })
      this.timer = clockOf(this).set(() => {
        this.timer = null
        this.box = to
        this.setData({ phase: 2, pill: pillAt(to) })
      }, STRETCH_MS)
    },

    clearTimer() {
      if (!this.timer) return
      clockOf(this).clear(this.timer)
      this.timer = null
    },
  },
})
