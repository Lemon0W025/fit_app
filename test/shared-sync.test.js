const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const serverDir = path.join(root, 'cloudfunctions/api/lib/shared')
const clientDir = path.join(root, 'miniprogram/utils/shared')

test('云函数与小程序的 shared 文件完全一致', () => {
  const serverFiles = fs.readdirSync(serverDir).filter((f) => f.endsWith('.js')).sort()
  const clientFiles = fs.readdirSync(clientDir).filter((f) => f.endsWith('.js')).sort()
  assert.deepEqual(clientFiles, serverFiles)
  for (const file of serverFiles) {
    const a = fs.readFileSync(path.join(serverDir, file), 'utf8')
    const b = fs.readFileSync(path.join(clientDir, file), 'utf8')
    assert.equal(b, a, `${file} 两侧内容不一致，请复制 cloudfunctions/api/lib/shared/${file}`)
  }
})

test('shared 文件不依赖运行环境', () => {
  for (const file of fs.readdirSync(serverDir)) {
    const src = fs.readFileSync(path.join(serverDir, file), 'utf8')
    assert.doesNotMatch(src, /\bwx\./, `${file} 不能使用 wx`)
    assert.doesNotMatch(src, /wx-server-sdk/, `${file} 不能引用 wx-server-sdk`)
  }
})
