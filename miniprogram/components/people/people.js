// 「几个人一起吃？」那一排（打卡页、结果页）：就我、2～5 人、更多（弹出 6 / 7 / 8 / 10 人）。
// value 由页面管：点了发 change { value: 人数 }，和现在一样的不发
const { peopleChips, PEOPLE_MORE } = require('../../utils/portion')

Component({
  options: { addGlobalClass: true }, // 选项小块用 app.wxss 的 .chip
  properties: {
    value: { type: Number, value: 1 },
  },

  data: {
    chips: peopleChips(1),
  },

  observers: {
    value(v) {
      this.setData({ chips: peopleChips(v || 1) })
    },
  },

  // 一开始就是几个人（结果页打开时已经分过）：observers 不一定在初始化时触发
  lifetimes: {
    attached() {
      this.setData({ chips: peopleChips(this.data.value || 1) })
    },
  },

  methods: {
    onTap(e) {
      const value = e.currentTarget.dataset.value
      if (value === 'more') {
        wx.showActionSheet({
          itemList: PEOPLE_MORE.map((n) => `${n} 个人`),
          success: (res) => this.pick(PEOPLE_MORE[res.tapIndex]),
        })
        return
      }
      this.pick(Number(value))
    },

    pick(n) {
      if (!n || n === (this.data.value || 1)) return
      this.triggerEvent('change', { value: n })
    },
  },
})
