const { ACTIVITY_LABELS, MIN_KCAL, round1 } = require('./shared/nutrition')
const { MEAL_LABELS, RATING_LABELS } = require('./shared/meal-types')
const { timeText } = require('./shared/date')

const COACH_NAME = '小暖'

const PERSONA = `你是「${COACH_NAME}」，一位温和又认真的养生师，通过微信小程序陪伴用户健康减重。

你的风格：
- 用现代营养学算账（热量、蛋白质、碳水、脂肪），用养生常识说话（食物寒热温凉、三餐规律、细嚼慢咽、少油少盐、早睡早起）。
- 口语化、亲切，像信得过的老朋友；以鼓励为主，问题直说但不说教。

底线：
- 不做医疗诊断，不推荐药物或保健品。
- 不建议每日摄入低于 ${MIN_KCAL.female} 千卡（男性 ${MIN_KCAL.male} 千卡），不鼓励不吃饭。
- 发现明显节食、暴饮暴食，或用户提到身体不适时，温和提醒并建议咨询医生或专业营养师。`

const MEAL_SYSTEM = `${PERSONA}

你的任务：用户每餐拍照或文字打卡，你估算这一餐的热量和营养素，给出点评和下一餐建议。

估算方法：
- 根据图片里的碗、盘、筷子等参照物或用户描述判断份量，中国家常菜按常见做法的用油量计算。
- 用户备注优先于你的判断（比如"米饭只吃了一半"）。
- 点评不超过 80 字，建议不超过 60 字，要具体到吃什么、吃多少；结合今天剩余的热量预算。
- 【拍照时间】写着「准时」的，顺口夸一句按时吃饭；写着「不在饭点」的，温和提醒下顿按时吃、吃之前先拍，不要批评。

评级：green = 搭配合理、热量合适；yellow = 有可以改进的地方；red = 明显超量或很不健康。

只输出一个 JSON 对象，不要输出任何其他文字。格式：
{"isFood": true, "foods": [{"name": "菜名", "portion": "份量", "kcal": 230}], "totalKcal": 630, "protein": 22, "carbs": 60, "fat": 32, "rating": "green", "comment": "点评", "suggestion": "下一餐建议"}
其中 protein、carbs、fat 单位是克。如果图片里不是食物，只输出 {"isFood": false, "comment": "简短说明"}。`

const SUMMARY_SYSTEM = `${PERSONA}

你的任务：根据用户今天的打卡记录写一段今日总结。
- 不超过 150 字，像老朋友发微信。
- 先肯定做得好的地方，再指出最需要注意的一点，最后给明天一条具体建议（可以结合作息、食物寒热）。
- 如果今天吃得明显过少，要提醒好好吃饭。
- 直接输出总结正文，不要标题，不要 Markdown。`

function profileText(profile) {
  const sex = profile.sex === 'male' ? '男' : '女'
  const activity = ACTIVITY_LABELS[profile.activity] || '未知'
  return [
    `【用户档案】${profile.nickname || '用户'}，${sex}，${profile.age} 岁，身高 ${profile.heightCm} cm，体重 ${profile.weightKg} kg，目标 ${profile.targetWeightKg} kg，日常活动：${activity}`,
    `【忌口/偏好】${profile.avoid || '无'}`,
  ].join('\n')
}

function budgetText(dailyKcal, consumedKcal) {
  const remaining = dailyKcal - consumedKcal
  const rest = remaining >= 0 ? `还剩 ${remaining} 千卡` : `已超出 ${-remaining} 千卡`
  return `【今日热量】预算 ${dailyKcal} 千卡，本餐之前已吃 ${consumedKcal} 千卡，${rest}`
}

// 什么时候拍的、算不算准时（饭点规则在 shared/timing.js）
function timingText(mealType, timing, at, times) {
  if (!at) return ''
  const clock = timeText(at.getTime())
  if (!timing || !times) return `【拍照时间】${clock}`
  const status = timing === 'on' ? '准时' : '不在饭点'
  return `【拍照时间】${clock}，${status}（${MEAL_LABELS[mealType]}饭点 ${times[mealType]}）`
}

function buildMealMessages({ profile, mealType, note, imageUrl, consumedKcal, timing, at, times }) {
  const lines = [
    profileText(profile),
    budgetText(profile.dailyKcal, consumedKcal),
    `【本餐】${MEAL_LABELS[mealType] || '加餐'}`,
    timingText(mealType, timing, at, times),
    `【用户备注】${note || '无'}`,
    imageUrl
      ? '请看图片估算这一餐。'
      : '用户这次没有拍照，请根据上面的文字描述估算，并在点评里说明是按描述估算的。',
  ].filter(Boolean)
  const text = lines.join('\n')
  const user = imageUrl
    ? { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageUrl } }] }
    : { role: 'user', content: text }
  return [{ role: 'system', content: MEAL_SYSTEM }, user]
}

function mealLine(meal) {
  const label = MEAL_LABELS[meal.mealType] || '加餐'
  if (meal.status !== 'done' || !meal.analysis) return `- ${label}：分析失败${meal.note ? `（备注：${meal.note}）` : ''}`
  const a = meal.analysis
  const foods = (a.foods || []).map((f) => f.name).join('、') || (meal.note || '未识别')
  const rating = RATING_LABELS[a.rating] ? `，评级 ${RATING_LABELS[a.rating]}` : ''
  return `- ${label}：${foods}，约 ${a.totalKcal} 千卡${rating}`
}

function weightText(latest, previous) {
  if (!latest) return '【体重】暂无体重记录'
  let text = `【体重】最近 ${latest.weightKg} kg（${latest.date}）`
  if (previous) {
    const diff = round1(latest.weightKg - previous.weightKg)
    text += `，较上次（${previous.date}）${diff > 0 ? '+' + diff : diff} kg`
  }
  return text
}

function buildSummaryMessages({ profile, date, meals, totals, latestWeight, previousWeight }) {
  const lines = [
    profileText(profile),
    `【日期】${date}`,
    `【今日热量】预算 ${profile.dailyKcal} 千卡，实际 ${totals.kcal} 千卡；蛋白质 ${totals.protein} g，碳水 ${totals.carbs} g，脂肪 ${totals.fat} g`,
    '【各餐】',
    ...(meals.length ? meals.map(mealLine) : ['- 无']),
    weightText(latestWeight, previousWeight),
  ]
  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: lines.join('\n') },
  ]
}

module.exports = { COACH_NAME, buildMealMessages, buildSummaryMessages }
