const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { normalizePrivateKey } = require('../scripts/wechat')

// 每次现生成一把测试用的密钥，不用任何真实密钥
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const pkcs1 = privateKey.export({ type: 'pkcs1', format: 'pem' })
const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'pem' })
const body = (pem) => pem.replace(/-----[A-Z ]+-----/g, '').trim()

function sameKey(normalized, original) {
  const a = crypto.createPrivateKey(normalized).export({ type: 'pkcs8', format: 'der' })
  const b = crypto.createPrivateKey(original).export({ type: 'pkcs8', format: 'der' })
  assert.ok(a.equals(b))
}

test('完整的 PEM 原样可用', () => {
  sameKey(normalizePrivateKey(pkcs1), pkcs1)
  sameKey(normalizePrivateKey(pkcs8), pkcs8)
})

test('只粘贴了中间内容、没有 BEGIN/END 两行', () => {
  const fixed = normalizePrivateKey(body(pkcs1))
  assert.match(fixed, /^-----BEGIN RSA PRIVATE KEY-----\n/)
  sameKey(fixed, pkcs1)
})

test('PKCS#8 格式缺标题时也能认出来', () => {
  const fixed = normalizePrivateKey(body(pkcs8))
  assert.match(fixed, /^-----BEGIN PRIVATE KEY-----\n/)
  sameKey(fixed, pkcs8)
})

test('换行丢失或写成 \\n', () => {
  sameKey(normalizePrivateKey(pkcs1.replace(/\n/g, '')), pkcs1)
  sameKey(normalizePrivateKey(pkcs1.replace(/\n/g, '\\n')), pkcs1)
  sameKey(normalizePrivateKey(body(pkcs1).replace(/\n/g, ' ')), pkcs1)
})

test('没有内容时返回空字符串', () => {
  assert.equal(normalizePrivateKey(undefined), '')
  assert.equal(normalizePrivateKey('   '), '')
})
