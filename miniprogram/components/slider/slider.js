// 联动滑杆：value 在 min～max 之间、按 step 一格一格（比如克数 10 克一格、倍数 0.25 一格）。
// 拖着走跟手在 slider.wxs 里；这里管气泡里的字（prefix + 数 + unit，比如「150 克」「×1.5」）和事件：
// changing（拖的时候数变了就发，页面跟着改「约 N 千卡」），change（松手）。页面改 value 时圆钮带过渡滑过去；拖着的时候页面改 value 不管
function decimals(step) {
  const s = String(step)
  const i = s.indexOf('.')
  return i === -1 ? 0 : s.length - i - 1
}

function ratioOf(value, min, max) {
  if (!(max > min)) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

Component({
  properties: {
    min: { type: Number, value: 0 },
    max: { type: Number, value: 100 },
    step: { type: Number, value: 1 },
    value: { type: Number, value: 0 },
    unit: { type: String, value: '' },
    prefix: { type: String, value: '' },
  },

  data: {
    ratio: 0,
    shown: '0',
  },

  observers: {
    'value, min, max, step'(value) {
      if (this.dragging) return
      this.show(value)
    },
  },

  lifetimes: {
    attached() {
      this.show(this.data.value)
    },
  },

  methods: {
    text(value) {
      return String(Number(Number(value).toFixed(decimals(this.data.step))))
    },

    show(value) {
      const ratio = Math.round(ratioOf(value, this.data.min, this.data.max) * 10000) / 10000
      this.setData({ ratio, shown: this.text(value) })
    },

    // slider.wxs：手指按下 / 拖着，数落到新的一格
    onSlide({ value }) {
      this.dragging = true
      if (value === this.current) return
      this.current = value
      this.setData({ shown: this.text(value) })
      this.triggerEvent('changing', { value })
    },

    // slider.wxs：松手
    onSlideEnd({ value }) {
      this.dragging = false
      this.current = undefined
      this.show(value)
      this.triggerEvent('change', { value })
    },
  },
})
