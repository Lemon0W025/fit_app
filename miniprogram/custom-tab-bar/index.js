// 自定义底栏（app.json 的 tabBar.custom）：今日 · 营地 · [拍照] · 体重 · 我的。
// 中间的黑色大圆钮不是 tab，直接去拍照页（打卡页按现在的时间自己选好是哪顿）。
// 每个 tab 页有自己的一份底栏：按当前页面的路径自己点亮（页面 onShow 里 utils/tab-bar.js 的 syncTabBar 再对一次）
const TABS = [
  { key: 'today', page: 'pages/today/today', text: '今日', icon: 'grid' },
  { key: 'camp', page: 'pages/camp/camp', text: '营地', icon: 'tent' },
  { key: 'camera', camera: true },
  { key: 'weight', page: 'pages/weight/weight', text: '体重', icon: 'scale' },
  { key: 'profile', page: 'pages/profile/profile', text: '我的', icon: 'user' },
]

function currentRoute() {
  try {
    const pages = getCurrentPages()
    return pages.length ? pages[pages.length - 1].route : ''
  } catch (e) {
    return ''
  }
}

Component({
  properties: {
    // 预览渲染器直接给；小程序里不传，按当前页面算
    selected: { type: String, value: '' },
  },

  data: {
    tabs: TABS,
    current: '',
  },

  lifetimes: {
    attached() {
      this.sync()
    },
  },

  pageLifetimes: {
    show() {
      this.sync()
    },
  },

  methods: {
    sync(route) {
      const now = route || this.data.selected || currentRoute()
      if (now && now !== this.data.current) this.setData({ current: now })
    },

    go(e) {
      const page = e.currentTarget.dataset.page
      if (!page || page === this.data.current) return
      wx.switchTab({ url: `/${page}` })
    },

    shoot() {
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
      wx.navigateTo({ url: '/pages/checkin/checkin' })
    },
  },
})
