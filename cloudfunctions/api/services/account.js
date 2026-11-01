const { AppError, CODES } = require('../lib/errors')
const { dateKey } = require('../lib/shared/date')

// 测试期间「从头再来」：清空这个账号的全部数据（档案、打卡和照片、每日总结、体重、营地、常用份量、提醒），
// 回到第一次打开的样子，好把新手指引从头走一遍。只有 config.testReset 开着（until 那天之前）才能用，只清自己的
function createAccountService({ repo, config, now, deleteFile, log = () => {} }) {
  const live = () => {
    const t = config.testReset
    return !!t && dateKey(now()) <= t.until
  }

  return {
    // 「我的」页要不要显示「从头再来」
    async info() {
      return { canReset: live() }
    },

    async reset(openid) {
      if (!live()) throw new AppError(CODES.FORBIDDEN, '这个功能现在关着')
      const { fileIDs } = await repo.resetUser(openid)
      // 照片删不掉不影响（只占点云存储）
      for (const id of fileIDs) {
        try {
          await deleteFile(id)
        } catch (e) {
          log('reset: delete photo failed', e)
        }
      }
      return { reset: true }
    },
  }
}

module.exports = { createAccountService }
