// 新手导览（components/tour）：第一次进首页、第一次进营地，一步一步圈出要点的地方说一句。看过就记在本地（toursSeen），
// 「使用说明」页底下能「再看一遍」（清掉记录）；「我的」→「从头再来」清空本地存储，也会重新看。
// 每一步：selector 圈哪个（页面里的 id / class，找不到就不圈、说明放中间）；scroll 先把它滚到屏幕里；
// tab 指着底下第几格（底栏 5 格、中间是拍照；底栏盖不住，说明贴在最下面、箭头朝下）；done 最后一步按钮上的字
const { BEANS } = require('./shared/forest')
const { SPIN_COST } = require('./shared/garden')

const KEY = 'toursSeen'

const TOURS = {
  today: [
    {
      selector: '#tour-next',
      title: '到饭点，点这里拍照',
      text: `早中晚吃饭前，点这个大按钮拍一张。饭点前后一小时内拍算准时，能得 ${BEANS.onTime} 暖豆。`,
    },
    {
      selector: '#tour-ring',
      scroll: true,
      title: '今天吃了多少',
      text: '大字是今天吃了预算的百分之几，下面写着还能吃多少；预算按你的身高体重算的。',
    },
    {
      selector: '#tour-beans',
      scroll: true,
      title: '暖豆和印章',
      text: `每拍一顿盖一个印章，准时的带「准」字；三顿都准时再加 ${BEANS.allOnTime} 暖豆。`,
    },
    {
      tab: 1,
      tabs: 5,
      title: '暖豆拿去营地',
      text: '下面第二个「营地」：用暖豆抽好吃的、煮一锅，小动物闻着香味就来住。',
    },
    {
      title: '不会用了就看说明',
      text: '点下面的「我的」→「使用说明」，每一步都写着。',
      done: '开始用',
    },
  ],
  camp: [
    {
      selector: '.pot-hit',
      title: '营地中间的锅',
      text: '点锅，选一样吃的放进去，火就点起来了。一天最多煮三样。',
    },
    {
      selector: '#tour-gacha',
      title: '扭蛋：用暖豆抽吃的',
      text: `${SPIN_COST} 暖豆抽一次，抽到的吃的放进背包。`,
    },
    {
      selector: '#tour-bag',
      title: '背包',
      text: '抽到的吃的、买来的家具都在这里。',
    },
    {
      selector: '#tour-residents',
      title: '小动物',
      text: '锅里的香味会引来爱吃它的小动物，锅里有吃的它就待着；喂熟了就住下。点小动物，它会跟你说话。',
    },
    {
      selector: '#tour-shop',
      title: '商店',
      text: '暖豆还能买秋千、花、小灯笼，拖到草地上摆好，小动物会去玩。',
    },
    {
      selector: '#tour-album',
      title: '图册',
      text: '每天拍照打卡就是喂它们，越喂越亲，亲了能在这里看它们的小故事。',
      done: '去玩吧',
    },
  ],
}

function read() {
  try {
    const v = wx.getStorageSync(KEY)
    return v && typeof v === 'object' ? v : {}
  } catch (e) {
    return {}
  }
}

// 本地存储读不到时当没看过（多看一次没关系）
const seen = (name) => !!read()[name]

function markSeen(name) {
  try {
    wx.setStorageSync(KEY, { ...read(), [name]: true })
  } catch (e) {
    // 存不了下次再看一遍
  }
}

function resetTours() {
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {
    // 没存过
  }
}

module.exports = { TOURS, seen, markSeen, resetTours }
