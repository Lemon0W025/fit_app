// 调用 api 云函数、上传照片、统一的错误提示

const { dateKey } = require('./shared/date')

function makeError(message, code) {
  const err = new Error(message)
  err.code = code
  return err
}

// 把 wx.cloud.callFunction 的失败信息翻译成能看懂、能照着处理的提示
function describeCallFailure(errMsg) {
  const msg = String(errMsg || '')
  if (/-504003|timed out|timeout/i.test(msg)) {
    return makeError('云函数超时了：请到云开发控制台把 api 云函数的超时时间调到 60 秒', 'TIMEOUT')
  }
  if (/FunctionName/i.test(msg)) {
    return makeError('还没有部署云函数：在开发者工具里右键 cloudfunctions/api，选「上传并部署：云端安装依赖」', 'NOT_DEPLOYED')
  }
  if (/-601034|开通云开发|env not exists|-501001/i.test(msg)) {
    return makeError('云开发环境不可用：请先开通云开发，并在 miniprogram/config.js 填写环境 ID', 'NO_CLOUD')
  }
  return makeError('网络不太好，稍后再试', 'NETWORK')
}

function call(action, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api',
      data: { action, data },
      success: (res) => {
        const r = res.result
        if (r && r.ok) {
          resolve(r.data)
          return
        }
        reject(makeError((r && r.message) || '服务开小差了，稍后再试', (r && r.code) || 'UNKNOWN'))
      },
      fail: (err) => {
        console.error(`[api] ${action} failed`, err)
        reject(describeCallFailure(err && err.errMsg))
      },
    })
  })
}

function compressImage(src) {
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: 70,
      compressedWidth: 1280,
      success: (res) => resolve(res.tempFilePath),
      fail: () => resolve(src),
    })
  })
}

function uploadMealPhoto(tempPath) {
  return compressImage(tempPath).then((filePath) => new Promise((resolve, reject) => {
    const match = filePath.match(/\.(\w+)$/)
    const ext = match ? match[1] : 'jpg'
    const random = Math.random().toString(36).slice(2, 8)
    wx.cloud.uploadFile({
      cloudPath: `meals/${dateKey()}/${Date.now()}-${random}.${ext}`,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: (err) => {
        console.error('[api] upload failed', err)
        reject(makeError('照片上传失败，检查一下网络再试', 'UPLOAD'))
      },
    })
  }))
}

// 短消息用 toast，长消息（比如部署提示）用弹窗，免得被截断
function showError(err) {
  const message = (err && err.message) || '出错了，稍后再试'
  if (message.length > 14) {
    wx.showModal({ title: '提示', content: message, showCancel: false })
  } else {
    wx.showToast({ title: message, icon: 'none' })
  }
}

module.exports = { call, uploadMealPhoto, showError, describeCallFailure }
