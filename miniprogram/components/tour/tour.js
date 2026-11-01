// 新手导览：屏幕压暗，圈出要说的那一块（亮着、外面一圈白光一呼一吸），旁边一张大字卡片说这是干什么的，箭头指着它。
// steps 见 utils/tours.js；show 变成 true 从第一步开始。点「下一步」或屏幕任何地方往下走，「跳过」直接结束；结束发 done { skipped }。
// 圈的位置用 wx.createSelectorQuery() 在页面里量（目标都在页面里，不在别的组件里）；要滚的先 pageScrollTo 再量
const { clockOf } = require('../../utils/fx')

const PAD = 8 // 圈比目标大一圈
const GAP = 14 // 卡片离圈多远
const EDGE = 16 // 卡片离屏幕边
const SCROLL_MS = 300

Component({
  properties: {
    steps: { type: Array, value: [] },
    show: { type: Boolean, value: false },
  },

  data: {
    i: 0,
    step: null,
    last: false, // 最后一步：没有「跳过」，按钮写 step.done（不写就是「知道了」）
    nextText: '下一步',
    hole: null,
    tip: null,
    ready: false,
  },

  observers: {
    show(v) {
      if (v) this.go(0)
      else this.setData({ ready: false })
    },
  },

  lifetimes: {
    detached() {
      this.gone = true
      if (this.timer) clockOf(this).clear(this.timer)
    },
  },

  methods: {
    go(i) {
      const step = this.data.steps[i]
      if (!step) return this.finish(false)
      const last = i + 1 >= this.data.steps.length
      this.setData({ i, step, last, nextText: last ? step.done || '知道了' : '下一步', ready: false })
      if (!step.selector) return this.place(null)
      const measure = () => {
        wx.createSelectorQuery()
          .select(step.selector)
          .boundingClientRect()
          .exec((res) => {
            if (!this.gone && this.data.i === i) this.place((res && res[0]) || null)
          })
      }
      if (!step.scroll) return measure()
      wx.pageScrollTo({ selector: step.selector, offsetTop: -120, duration: SCROLL_MS })
      const clock = clockOf(this)
      if (this.timer) clock.clear(this.timer)
      this.timer = clock.set(measure, SCROLL_MS + 80)
    },

    // 按量到的位置摆圈和卡片：圈在屏幕上半截，卡片在圈下面；在下半截，卡片在圈上面。指 tab 的贴在最下面、箭头朝下
    place(rect) {
      const { windowWidth: W, windowHeight: H } = wx.getWindowInfo()
      const step = this.data.step
      const width = W - EDGE * 2
      let hole = null
      let tip = { side: 'none', style: `left: ${EDGE}px; width: ${width}px; top: ${Math.round(H * 0.32)}px` }
      if (rect && rect.width && rect.height) {
        hole = {
          left: Math.round(rect.left - PAD),
          top: Math.round(rect.top - PAD),
          width: Math.round(rect.width + PAD * 2),
          height: Math.round(rect.height + PAD * 2),
        }
        const cx = rect.left + rect.width / 2
        const arrow = Math.round(Math.min(Math.max(cx - EDGE - 12, 20), width - 44))
        const below = rect.top + rect.height / 2 < H / 2
        tip = below
          ? { side: 'up', arrow, style: `left: ${EDGE}px; width: ${width}px; top: ${hole.top + hole.height + GAP}px` }
          : { side: 'down', arrow, style: `left: ${EDGE}px; width: ${width}px; bottom: ${H - hole.top + GAP}px` }
      } else if (step && step.tab != null) {
        const cx = ((step.tab + 0.5) / (step.tabs || 4)) * W
        const arrow = Math.round(Math.min(Math.max(cx - EDGE - 12, 20), width - 44))
        tip = { side: 'down', arrow, style: `left: ${EDGE}px; width: ${width}px; bottom: ${GAP}px` }
      }
      this.setData({ hole, tip, ready: true })
    },

    next() {
      if (!this.data.ready) return
      if (this.data.i + 1 < this.data.steps.length) this.go(this.data.i + 1)
      else this.finish(false)
    },

    skip() {
      this.finish(true)
    },

    finish(skipped) {
      this.setData({ ready: false, hole: null, step: null })
      this.triggerEvent('done', { skipped })
    },

    noop() {},
  },
})
