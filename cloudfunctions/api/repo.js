// 云数据库实现，接口与 test/helpers/fake-repo.js 一致
// 集合第一次用到时如果还没建，会自动创建，省去控制台手动建表

const MEALS_PER_DAY_LIMIT = 100

function isMissingCollection(e) {
  const msg = String((e && (e.errMsg || e.message)) || '')
  return (e && e.errCode === -502005) || /collection not exist|Db or Table not exist/i.test(msg)
}

function createRepo(db) {
  const _ = db.command

  async function withCollection(name, fn) {
    try {
      return await fn(db.collection(name))
    } catch (e) {
      if (!isMissingCollection(e)) throw e
      try {
        await db.createCollection(name)
      } catch (createError) {
        // 可能被并发请求抢先创建了，忽略后重试
      }
      return fn(db.collection(name))
    }
  }

  async function findOne(name, where) {
    const res = await withCollection(name, (c) => c.where(where).limit(1).get())
    return res.data[0] || null
  }

  // doc().set 的 data 不能带 _id；从库里读出来再写回的对象会带着它
  function setDoc(name, id, data) {
    const { _id, ...rest } = data
    return withCollection(name, (c) => c.doc(id).set({ data: rest }))
  }

  return {
    getProfile(openid) {
      return findOne('users', { _id: openid })
    },
    async saveProfile(openid, profile) {
      await setDoc('users', openid, { ...profile, _openid: openid })
    },

    async listMeals(openid, date) {
      const res = await withCollection('meals', (c) =>
        c.where({ _openid: openid, date }).orderBy('createdAt', 'asc').limit(MEALS_PER_DAY_LIMIT).get())
      return res.data
    },
    getMeal(openid, id) {
      return findOne('meals', { _id: id, _openid: openid })
    },
    async addMeal(meal) {
      const res = await withCollection('meals', (c) => c.add({ data: meal }))
      return res._id
    },
    async updateMeal(id, patch) {
      // analysis 是嵌套对象，用 _.set 整体替换，避免和旧结果深度合并
      const data = { ...patch }
      if (data.analysis) data.analysis = _.set(data.analysis)
      await withCollection('meals', (c) => c.doc(id).update({ data }))
    },
    async deleteMeal(id) {
      await withCollection('meals', (c) => c.doc(id).remove())
    },

    getSummary(openid, date) {
      return findOne('summaries', { _id: `${openid}_${date}` })
    },
    async saveSummary(openid, date, doc) {
      await setDoc('summaries', `${openid}_${date}`, { ...doc, _openid: openid, date })
    },

    async saveWeight(openid, date, weightKg) {
      await setDoc('weights', `${openid}_${date}`, { _openid: openid, date, weightKg, updatedAt: Date.now() })
    },
    async listWeights(openid, limit) {
      const res = await withCollection('weights', (c) =>
        c.where({ _openid: openid }).orderBy('date', 'desc').limit(limit).get())
      return res.data.reverse().map((w) => ({ date: w.date, weightKg: w.weightKg }))
    },
  }
}

module.exports = { createRepo, isMissingCollection }
