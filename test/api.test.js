const test = require('node:test')
const assert = require('node:assert/strict')
const { describeCallFailure } = require('../miniprogram/utils/api')

test('云函数超时给出调整超时时间的提示', () => {
  const e = describeCallFailure('cloud.callFunction:fail Error: errCode: -504003 | errMsg: Invoking task timed out after 3 seconds')
  assert.equal(e.code, 'TIMEOUT')
  assert.match(e.message, /60 秒/)
})

test('云函数没部署给出部署提示', () => {
  const e = describeCallFailure('cloud.callFunction:fail Error: errCode: -501000 | errMsg: [ResourceNotFound.FunctionName] FunctionName parameter could not be found.')
  assert.equal(e.code, 'NOT_DEPLOYED')
  assert.match(e.message, /上传并部署/)
})

test('云开发环境没初始化', () => {
  const e = describeCallFailure('cloud.callFunction:fail Error: errCode: -601034 | errMsg: 没有权限，请先开通云开发或者云托管')
  assert.equal(e.code, 'NO_CLOUD')
  assert.match(e.message, /云开发/)
})

test('其他失败按网络问题处理', () => {
  const e = describeCallFailure('request:fail')
  assert.equal(e.code, 'NETWORK')
  assert.equal(describeCallFailure(undefined).code, 'NETWORK')
})
