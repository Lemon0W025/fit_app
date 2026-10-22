const { ACTIVITY_FACTORS, round1 } = require('./shared/nutrition')

const NUMBER_FIELDS = [
  { key: 'age', label: '年龄', min: 10, max: 100, unit: '岁', integer: true },
  { key: 'heightCm', label: '身高', min: 100, max: 230, unit: 'cm' },
  { key: 'weightKg', label: '体重', min: 30, max: 250, unit: 'kg' },
  { key: 'targetWeightKg', label: '目标体重', min: 30, max: 250, unit: 'kg' },
]

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function validateProfile(input) {
  const src = input || {}
  const errors = []
  const value = {
    nickname: text(src.nickname, 20) || '我',
    sex: src.sex,
    age: 0,
    heightCm: 0,
    weightKg: 0,
    targetWeightKg: 0,
    activity: src.activity,
    avoid: text(src.avoid, 100),
  }

  if (src.sex !== 'female' && src.sex !== 'male') errors.push('请选择性别')
  if (!ACTIVITY_FACTORS[src.activity]) errors.push('请选择日常活动量')

  NUMBER_FIELDS.forEach((f) => {
    const n = Number(src[f.key])
    if (src[f.key] === '' || src[f.key] == null || !isFinite(n) || n < f.min || n > f.max) {
      errors.push(`${f.label}需要在 ${f.min}-${f.max} ${f.unit} 之间`)
      return
    }
    value[f.key] = f.integer ? Math.round(n) : round1(n)
  })

  return { value, errors }
}

module.exports = { validateProfile }
