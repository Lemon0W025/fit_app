// 纪念章：纯 CSS 画的圆章 + 两条绶带，中间写天数（打卡日历、里程碑庆祝卡共用）。size 是圆章直径（rpx）
Component({
  properties: {
    days: { type: Number, value: 0 },
    tier: { type: String, value: 'bronze' },
    glow: { type: Boolean, value: false },
    locked: { type: Boolean, value: false },
    size: { type: Number, value: 120 },
  },
})
