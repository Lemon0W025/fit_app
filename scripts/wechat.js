// 用微信官方的 miniprogram-ci 在命令行里部署，不用开微信开发者工具。
//
// 需要：
//   - 环境变量 WX_UPLOAD_KEY：小程序后台生成的「代码上传密钥」文件的全部内容
//   - miniprogram/config.js 里填好云开发环境 ID（envId）
//   - 能访问 servicewechat.com、tcb/scf/flexdb.tencentcloudapi.com
//
// 用法：
//   npm run wx:function            上传并部署 api 云函数（云端安装依赖）
//   npm run wx:preview             生成预览二维码 → .wechat/preview-qrcode.jpg，用微信扫码体验
//   npm run wx:upload -- [版本号] [描述]   上传为开发版本（可在后台设为体验版）
//   npm run wx:art [-- cut]        把 art/camp/ 的底图切块、art/decor/ 的装饰块、art/anim/ 的动画拼图、art/cut/ 的帐篷和锅抠图传到云存储 camp/base/、camp/decor/、camp/anim/、camp/cut/

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, '.wechat')
const ROBOT = 1

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

// 把各种粘贴方式还原成标准 PEM：换行被写成 \n、换行丢失、或者 BEGIN/END 两行整个没带上
function normalizePrivateKey(raw) {
  const text = String(raw || '').replace(/\\n/g, '\n').trim()
  const header = text.match(/-----BEGIN ([A-Z ]+)-----/)
  const body = text.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '')
  if (!body) return ''
  // 没有标题行时按内容判断格式：PKCS#8 开头带 RSA 算法标识，否则按 PKCS#1
  const isPkcs8 = body.slice(0, 48).indexOf('ADANBgkqhkiG9w0BAQEF') !== -1
  const label = header ? header[1] : isPkcs8 ? 'PRIVATE KEY' : 'RSA PRIVATE KEY'
  return [`-----BEGIN ${label}-----`, ...body.match(/.{1,64}/g), `-----END ${label}-----`].join('\n') + '\n'
}

function privateKey() {
  const key = normalizePrivateKey(process.env.WX_UPLOAD_KEY)
  if (!key) fail('缺少环境变量 WX_UPLOAD_KEY（小程序后台「开发管理 → 开发设置 → 小程序代码上传」生成的密钥内容）')
  return key
}

function envId() {
  const { envId: id } = require(path.join(ROOT, 'miniprogram/config.js'))
  if (!id) fail('miniprogram/config.js 里的 envId 还没填（云开发控制台 → 设置 → 环境 ID）')
  return id
}

function lastCommitSubject() {
  try {
    return execSync('git log -1 --pretty=%s', { cwd: ROOT }).toString().trim().slice(0, 60)
  } catch (e) {
    return ''
  }
}

function loadCi() {
  try {
    return require('miniprogram-ci')
  } catch (e) {
    fail('还没装 miniprogram-ci，先在项目根目录运行 npm install')
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!['function', 'preview', 'upload', 'art'].includes(command)) {
    fail('用法：node scripts/wechat.js function | preview | upload [版本号] [描述] | art')
  }

  const ci = loadCi()
  // 云端环境的出网走代理，miniprogram-ci 需要单独告诉它
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (proxy) ci.proxy(proxy)

  const { appid } = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'))
  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath: ROOT,
    privateKey: privateKey(),
    ignores: ['node_modules/**/*', 'test/**/*', 'docs/**/*', 'scripts/**/*', '.wechat/**/*'],
  })

  // art/cut 的版本：帐篷 / 锅抠图、火苗逐帧图改过就加一（传到 camp/cut-vN/，再把打印的前缀填进 config.cutArt）
  const CUT_VERSION = 2

  if (command === 'art') {
    const env = envId()
    // 营地底图切块 art/camp/ → camp/base/；装饰块 art/decor/ → camp/decor/；宠物动画拼图 art/anim/ → camp/anim/。有哪个传哪个
    // 只传某几类：npm run wx:art -- cut（base / decor / anim / cut）；不写就全传
    const only = process.argv.slice(3)
    const jobs = [
      { name: 'base', dir: path.join(ROOT, 'art/camp'), check: 't00.jpg', remote: 'camp/base', key: 'campArt', hint: 'python3 scripts/camp/cut_art.py art/raw/camp/camp-hd.png' },
      { name: 'decor', dir: path.join(ROOT, 'art/decor'), check: null, remote: 'camp/decor', key: 'decorArt', hint: 'python3 scripts/camp/decor_patch.py' },
      { name: 'anim', dir: path.join(ROOT, 'art/anim'), check: null, remote: 'camp/anim', key: 'animArt', hint: 'python3 scripts/pack_anim.py' },
      // 抠图层和火苗逐帧图重新生成过就把版本号加一：同名覆盖的话 CDN 和手机会继续用旧图一阵子
      { name: 'cut', dir: path.join(ROOT, 'art/cut'), check: 'pot-0.png', remote: `camp/cut-v${CUT_VERSION}`, key: 'cutArt', hint: 'python3 scripts/camp/cutouts.py && python3 scripts/camp/fx_art.py' },
    ].filter((j) => (!only.length || only.includes(j.name)) && fs.existsSync(j.dir) && (!j.check || fs.existsSync(path.join(j.dir, j.check))) && fs.readdirSync(j.dir).some((f) => /\.(jpg|png)$/.test(f)))
    if (!jobs.length) fail('art/camp/、art/decor/、art/anim/、art/cut/ 里都没有切好的图：先跑 python3 scripts/camp/cut_art.py、decor_patch.py、pack_anim.py 或 cutouts.py')
    let bucket = ''
    try {
      // 拼 fileID 要桶名，miniprogram-ci 没公开，从它内部的环境信息里拿；拿不到就让用户去控制台看
      const { initEnvironmentByProject } = require('miniprogram-ci/dist/ci/cloud/utils')
      const { currentEnv } = await initEnvironmentByProject(project, env)
      bucket = (currentEnv && currentEnv.storages && currentEnv.storages[0] && currentEnv.storages[0].bucket) || ''
    } catch (e) {
      bucket = ''
    }
    for (const job of jobs) {
      console.log(`上传 ${path.relative(ROOT, job.dir)} → 云存储 ${env}:${job.remote}/ …`)
      await ci.cloud.uploadStorage({ project, env, path: job.dir, remotePath: job.remote })
      const prefix = bucket ? `cloud://${env}.${bucket}/${job.remote}/` : ''
      console.log(`✓ 已上传 ${fs.readdirSync(job.dir).length} 个文件`)
      console.log(prefix ? `  把 miniprogram/config.js 的 ${job.key} 填成 '${prefix}'` : `  fileID 前缀到云开发控制台 → 存储里看（形如 cloud://环境ID.桶名/${job.remote}/），填进 miniprogram/config.js 的 ${job.key}`)
    }
    console.log('  然后 npm run wx:preview')
    return
  }

  if (command === 'function') {
    const env = envId()
    console.log(`上传云函数 api → 环境 ${env}（云端安装依赖）…`)
    let res
    try {
      res = await ci.cloud.uploadFunction({
        project,
        env,
        name: 'api',
        path: path.join(ROOT, 'cloudfunctions/api'),
        remoteNpmInstall: true,
      })
    } catch (e) {
      // miniprogram-ci 在函数不存在时会直接报错，而且它自带的创建逻辑用的是 Node 8.9 运行时，
      // 所以第一次要在开发者工具里创建，之后才能用命令行更新
      if (/ResourceNotFound\.Function/.test(String(e && (e.message || e.code)))) {
        fail('云函数 api 还没创建：第一次请在微信开发者工具里右键 cloudfunctions/api →「上传并部署：云端安装依赖」，之后就能用命令行更新')
      }
      throw e
    }
    console.log(`✓ 云函数已部署：${res.filesCount} 个文件，${res.packSize} 字节`)
    return
  }

  const setting = { es6: true, enhance: true, minify: true, minifyWXSS: true, minifyWXML: true }

  if (command === 'preview') {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const dest = path.join(OUT_DIR, 'preview-qrcode.jpg')
    await ci.preview({
      project,
      desc: lastCommitSubject() || 'preview',
      setting,
      robot: ROBOT,
      qrcodeFormat: 'image',
      qrcodeOutputDest: dest,
    })
    console.log(`✓ 预览二维码已生成：${dest}`)
    return
  }

  const version = args[0] || require(path.join(ROOT, 'package.json')).version
  const desc = args[1] || lastCommitSubject() || `v${version}`
  await ci.upload({ project, version, desc, setting, robot: ROBOT })
  console.log(`✓ 已上传开发版本 ${version}（ci 机器人 ${ROBOT}）：${desc}`)
  console.log('  第一次上传后，到小程序后台「版本管理」把它选为体验版')
}

if (require.main === module) {
  main()
    // miniprogram-ci 完成后有时还留着网络连接，进程不退出
    .then(() => process.exit(0))
    .catch((e) => fail((e && (e.message || e.errMsg)) || String(e)))
}

module.exports = { normalizePrivateKey }
