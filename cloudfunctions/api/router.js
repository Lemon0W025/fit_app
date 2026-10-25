const { AppError } = require('./lib/errors')

// action → [service, method]
const ROUTES = {
  'profile.get': ['profile', 'get'],
  'profile.save': ['profile', 'save'],
  'meal.analyze': ['meal', 'analyze'],
  'meal.reanalyze': ['meal', 'reanalyze'],
  'meal.get': ['meal', 'get'],
  'meal.delete': ['meal', 'remove'],
  'day.get': ['day', 'get'],
  'summary.generate': ['day', 'summarize'],
  'weight.save': ['weight', 'save'],
  'weight.list': ['weight', 'list'],
  'forest.get': ['forest', 'get'],
  'camp.get': ['camp', 'get'],
  'camp.spin': ['camp', 'spin'],
  'camp.putFood': ['camp', 'putFood'],
  'camp.feed': ['camp', 'feed'],
  'camp.buy': ['camp', 'buy'],
  'camp.place': ['camp', 'place'],
  'camp.move': ['camp', 'move'],
  'camp.stash': ['camp', 'stash'],
  'camp.gift': ['camp', 'gift'],
  'camp.album': ['camp', 'album'],
}

function createRouter(services, { log = () => {} } = {}) {
  return async function route(event, openid) {
    if (!openid) return { ok: false, code: 'NO_OPENID', message: '请在微信里打开小程序' }

    const action = event && event.action
    if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(ROUTES, action)) {
      return { ok: false, code: 'UNKNOWN_ACTION', message: `不支持的操作：${action}` }
    }

    const [service, method] = ROUTES[action]
    try {
      const data = await services[service][method](openid, (event && event.data) || {})
      return { ok: true, data }
    } catch (e) {
      if (e instanceof AppError) return { ok: false, code: e.code, message: e.message }
      log(`action ${action} failed`, e)
      return { ok: false, code: 'INTERNAL', message: '服务开小差了，稍后再试' }
    }
  }
}

module.exports = { createRouter }
