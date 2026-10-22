// 解锁新树种时的庆祝弹窗（今日页和森林页都会用到）

function celebrateUnlocks(list, onGo) {
  if (!list || !list.length) return
  const names = list.map((s) => s.name).join('、')
  wx.showModal({
    title: '🎉 解锁新树种',
    content: `坚持打卡，解锁了${names}！去森林里换上试试吧`,
    confirmText: onGo ? '去看看' : '好的',
    cancelText: '等会儿',
    showCancel: !!onGo,
    success: (res) => {
      if (res.confirm && onGo) onGo()
    },
  })
}

module.exports = { celebrateUnlocks }
