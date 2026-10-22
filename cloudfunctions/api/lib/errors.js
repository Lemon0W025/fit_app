// 业务错误：message 直接展示给用户，所以要写成能看懂的中文

const CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  NO_PROFILE: 'NO_PROFILE',
  NOT_FOUND: 'NOT_FOUND',
  AI_FAILED: 'AI_FAILED',
  NO_MEALS: 'NO_MEALS',
}

class AppError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

module.exports = { CODES, AppError }
