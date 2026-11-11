// 自定义底栏（custom-tab-bar）：tab 页 onShow 时让底栏按这一页点亮（底栏自己也会按当前页面算，这里再对一次）
function syncTabBar(page) {
  const bar = page && typeof page.getTabBar === 'function' ? page.getTabBar() : null
  if (bar && typeof bar.sync === 'function') bar.sync(page.route)
}

module.exports = { syncTabBar }
