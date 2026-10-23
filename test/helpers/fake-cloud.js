// 模拟 wx-server-sdk 中本项目用到的部分（数据库链式调用、存储、AI），用于端到端测试 index.js + repo.js
// 行为尽量贴近真实 SDK：集合不存在时报 -502005；doc().set 的 data 不能带 _id；update 对嵌套对象做深度合并

const Module = require('node:module')
const path = require('node:path')

const SET = Symbol('command.set')

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v))
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function deepMerge(target, source) {
  const out = { ...target }
  for (const [k, v] of Object.entries(source)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : clone(v)
  }
  return out
}

// 查询指令：只实现用到的 gte / lte / and
const OP = Symbol('command.op')

function makeOp(test) {
  return { [OP]: test, and: (other) => makeOp((v) => test(v) && other[OP](v)) }
}

function matchValue(actual, expected) {
  return expected && expected[OP] ? expected[OP](actual) : actual === expected
}

function createFakeDb() {
  const collections = new Map()
  let seq = 0

  function getCol(name) {
    if (!collections.has(name)) {
      const e = new Error(`collection not exist: ${name}`)
      e.errCode = -502005
      throw e
    }
    return collections.get(name)
  }

  function query(name, where, order, lim) {
    return {
      where: (w) => query(name, w, order, lim),
      orderBy: (field, dir) => query(name, where, [...(order || []), { field, dir }], lim),
      limit: (n) => query(name, where, order, n),
      async get() {
        const docs = [...getCol(name).values()].filter((d) => Object.keys(where).every((k) => matchValue(d[k], where[k])))
        if (order) {
          docs.sort((a, b) => {
            for (const { field, dir } of order) {
              const sign = dir === 'desc' ? -1 : 1
              if (a[field] < b[field]) return -sign
              if (a[field] > b[field]) return sign
            }
            return 0
          })
        }
        return { data: docs.slice(0, lim).map(clone) }
      },
    }
  }

  return {
    collections,
    command: {
      set: (value) => ({ [SET]: true, value }),
      gte: (x) => makeOp((v) => v >= x),
      lte: (x) => makeOp((v) => v <= x),
    },
    async createCollection(name) {
      if (!collections.has(name)) collections.set(name, new Map())
    },
    collection(name) {
      return {
        ...query(name, {}, null, 100),
        async add({ data }) {
          const col = getCol(name)
          seq += 1
          const id = 'id' + seq
          col.set(id, { ...clone(data), _id: id })
          return { _id: id }
        },
        doc(id) {
          return {
            async set({ data }) {
              const col = getCol(name)
              if ('_id' in data) throw new Error('document.set:fail data 不能包含 _id')
              col.set(id, { ...clone(data), _id: id })
            },
            async update({ data }) {
              const col = getCol(name)
              const doc = col.get(id)
              if (!doc) return { stats: { updated: 0 } }
              for (const [k, v] of Object.entries(data)) {
                if (v && v[SET]) doc[k] = clone(v.value)
                else if (isPlainObject(v) && isPlainObject(doc[k])) doc[k] = deepMerge(doc[k], v)
                else doc[k] = clone(v)
              }
              return { stats: { updated: 1 } }
            },
            async remove() {
              getCol(name).delete(id)
              return { stats: { removed: 1 } }
            },
          }
        },
      }
    },
  }
}

function createFakeCloud({ openid = 'u1', replies = [] } = {}) {
  const db = createFakeDb()
  const queue = [...replies]
  const aiCalls = []
  const deletedFiles = []
  return {
    DYNAMIC_CURRENT_ENV: Symbol('DYNAMIC_CURRENT_ENV'),
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: openid }),
    ai: () => ({
      createModel: (provider) => ({
        async generateText(input) {
          aiCalls.push({ provider, ...input })
          const next = queue.shift()
          if (next instanceof Error) throw next
          if (next === undefined) throw new Error('fake ai: no more replies')
          return { text: next }
        },
      }),
    }),
    async getTempFileURL({ fileList }) {
      return { fileList: fileList.map((fileID) => ({ fileID, tempFileURL: `https://tmp/${fileID}` })) }
    },
    async downloadFile() {
      return { fileContent: Buffer.from('img') }
    },
    async deleteFile({ fileList }) {
      deletedFiles.push(...fileList)
      return { fileList: [] }
    },
    db,
    aiCalls,
    deletedFiles,
    setOpenid(id) {
      openid = id
    },
  }
}

// 用假的 wx-server-sdk 加载一份全新的云函数入口
// 测试默认不发测试福利，免得暖豆数对不上；要测福利的用例自己打开
require('../../cloudfunctions/api/config').testGrant = null

function loadCloudFunction(fakeCloud) {
  const indexPath = path.join(__dirname, '../../cloudfunctions/api/index.js')
  const originalLoad = Module._load
  Module._load = function (request, ...rest) {
    if (request === 'wx-server-sdk') return fakeCloud
    return originalLoad.call(this, request, ...rest)
  }
  delete require.cache[indexPath]
  try {
    return require(indexPath)
  } finally {
    Module._load = originalLoad
  }
}

module.exports = { createFakeCloud, loadCloudFunction }
