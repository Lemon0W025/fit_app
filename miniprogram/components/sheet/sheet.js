// 弹性抽屉：从下面弹上来（冲过头一点再回弹），遮罩同时淡入；点遮罩、点 ✕、往下拉都发 close，由页面把 show 设成 false。
// 关的动画放完才真的不渲染（不会一下子没了）。往下拉跟手在 sheet.wxs 里（渲染层直接改样式），这里只管开和关。
// 标题用 title；想放别的（比如分段控制器）就用 slot="head"；内容放默认插槽，超过高度在里面滚
const { clockOf } = require('../../utils/fx')

const ENTER_DELAY_MS = 30 // 先渲染出关着的样子，等一拍再打开，弹上来的过渡才播得出来
const LEAVE_MS = 280 // 关的过渡（260ms）放完再拿掉

Component({
  options: { multipleSlots: true },

  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
  },

  data: {
    rendered: false,
    open: false,
  },

  observers: {
    show(show) {
      if (show) this.enter()
      else this.leave()
    },
  },

  lifetimes: {
    // 一出来就要开着：属性的监听器可能已经先跑过（已经在渲染、等那一拍打开），不重来
    attached() {
      if (this.data.show && !this.data.rendered) this.enter()
    },
    detached() {
      this.clearTimer()
    },
  },

  methods: {
    enter() {
      this.clearTimer()
      if (this.data.open) return
      // 正在关（还没拿掉）：直接从当前位置弹回来
      if (this.data.rendered) {
        this.setData({ open: true })
        return
      }
      this.setData({ rendered: true }, () => {
        this.clearTimer()
        this.timer = clockOf(this).set(() => {
          this.timer = null
          this.setData({ open: true })
        }, ENTER_DELAY_MS)
      })
    },

    leave() {
      this.clearTimer()
      if (!this.data.rendered) return
      if (this.data.open) this.setData({ open: false })
      this.timer = clockOf(this).set(() => {
        this.timer = null
        this.setData({ rendered: false })
      }, LEAVE_MS)
    },

    clearTimer() {
      if (!this.timer) return
      clockOf(this).clear(this.timer)
      this.timer = null
    },

    // 点遮罩、点 ✕
    onClose() {
      this.triggerEvent('close', {})
    },

    // sheet.wxs：往下拉过了
    dragClose() {
      this.triggerEvent('close', {})
    },

    noop() {},
  },
})
