// 把全局 Date 定在某一刻：new Date() 和 Date.now() 都返回它，带参数的 new Date(...) 照常。
// 准时规则按真实时钟算，端到端和页面测试要固定时间；t.after 时换回真的 Date
function fixDate(t, when) {
  const Real = Date
  let fixed = new Real(when).getTime()
  class FixedDate extends Real {
    constructor(...args) {
      super(...(args.length ? args : [fixed]))
    }

    static now() {
      return fixed
    }
  }
  global.Date = FixedDate
  t.after(() => {
    global.Date = Real
  })
  return {
    set(next) {
      fixed = new Real(next).getTime()
    },
  }
}

module.exports = { fixDate }
