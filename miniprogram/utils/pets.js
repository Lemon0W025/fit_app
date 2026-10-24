// 宠物的台词和「找它」文案（纯函数，有单测）；数据在 shared/pets.js

const { petById } = require('./shared/pets')

// 一天的时段：5～8 早上（围食盆）、8～17 白天、17～19 傍晚（围篝火）、其余夜里（睡觉）
function periodOf(hour) {
  if (hour >= 5 && hour < 8) return 'morning'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 19) return 'dusk'
  return 'night'
}

function lineFor(petId, { period, action }, rand) {
  const p = petById(petId)
  if (!p) return ''
  if (action === 'eat') return p.lines.fed
  if (action === 'sleep' || period === 'night') return p.lines.night
  if (period === 'morning') return p.lines.morning
  const tap = p.lines.tap
  return tap[Math.min(tap.length - 1, Math.floor(rand * tap.length))]
}

// 「找它」清单里在干什么
function describe(state) {
  const d = state.decorName
  switch (state.action) {
    case 'sleep': return d ? `在${d}里睡觉` : '在睡觉'
    case 'walk': case 'fly': return '在溜达'
    case 'play': case 'climb': return d ? `在玩${d}` : '在玩'
    case 'sit': return d ? `坐在${d}上` : '围着篝火坐着'
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

module.exports = { periodOf, lineFor, describe, CSS_ACTIONS }
