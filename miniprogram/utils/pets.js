// 时段和「找它」文案（纯函数，有单测）；数据在 shared/pets.js，小动物说什么在 pet-talk.js

// 一天的时段：5～8 早上（围着锅）、8～17 白天、17～19 傍晚（火着着就围着锅坐）、其余夜里（困了的多）
function periodOf(hour) {
  if (hour >= 5 && hour < 8) return 'morning'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 19) return 'dusk'
  return 'night'
}

// 「找它」清单里在干什么
function describe(state) {
  const d = state.decorName
  // 在家具上：按在那儿干什么说（荡秋千、闻花、在野餐垫上吃点心）
  if (d && state.spot === 'swing') return `在荡${d}`
  if (d && state.spot === 'sniff') return `在闻${d}`
  if (d && state.spot === 'slide') return `在玩${d}`
  if (d && state.spot === 'climb') return `在${d}上张望`
  if (d && state.spot === 'tea') return '在喝热茶'
  if (d && state.spot === 'sit' && state.action === 'eat') return `在${d}上吃点心`
  switch (state.action) {
    case 'sleep': return d ? `在${d}里睡觉` : '在睡觉'
    case 'walk': case 'fly': return '在溜达'
    case 'play': case 'climb': return d ? `在玩${d}` : '在玩'
    case 'sit': return d ? `坐在${d}上` : '围着暖暖锅坐着'
    case 'sun': return '在晒太阳'
    case 'eat': return '在吃东西'
    case 'away': return '要清晨才来'
    case 'gift': return '叼着礼物找你'
    case 'perch': return d ? `站在${d}上` : '站在高处'
    default: return '在发呆'
  }
}

// 单张图时每个动作挂的 CSS 类（camp.wxss）
const CSS_ACTIONS = {
  walk: 'act-walk', fly: 'act-fly', idle: 'act-idle', sleep: 'act-sleep', eat: 'act-eat', fidget: 'act-idle', happy: 'act-happy',
  roll: 'act-roll', pet: 'act-pet', gift: 'act-walk', jump: 'act-jump', special: 'act-happy', sit: 'act-sit',
  sun: 'act-sleep', play: 'act-happy', climb: 'act-idle', perch: 'act-idle', dislike: 'act-dislike', away: '', look: 'act-idle',
}

module.exports = { periodOf, describe, CSS_ACTIONS }
