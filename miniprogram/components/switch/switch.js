// 弹性开关（docs/superpowers/specs/2026-10-27-ui-controls-design.md「其余：开关等提醒那块」）：
// 点一下底色从灰渐变到绿，圆钮带一点回弹滑过去；按住时圆钮往要去的方向拉长一点（看得出按到了）。
// checked 由页面管：点了发 change { value: 新的值 }，页面决定要不要真的改（比如要先申请微信的「允许」）。disabled 时点了不动
Component({
  properties: {
    checked: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
  },

  data: {
    pressed: false,
  },

  methods: {
    onPress() {
      if (!this.data.disabled) this.setData({ pressed: true })
    },

    onRelease() {
      if (this.data.pressed) this.setData({ pressed: false })
    },

    onTap() {
      if (this.data.disabled) return
      this.triggerEvent('change', { value: !this.data.checked })
    },
  },
})
