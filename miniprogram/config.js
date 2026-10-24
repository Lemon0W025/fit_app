// 云开发环境 ID：云开发控制台 → 设置 → 环境 ID（形如 cloud1-xxxxxx）
// 留空则使用微信开发者工具里当前选中的环境
module.exports = {
  envId: 'cloud1-d0gc0a24t697e8d8b',
  // 宅院底图在云存储里的 fileID 前缀（npm run wx:art 上传后会打印，形如 cloud://环境ID.桶名/garden/estate/）
  // 留空用包里的白模切块
  estateArt: 'cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/garden/estate/',
  // 小动物动画拼图在云存储里的 fileID 前缀（同样由 npm run wx:art 上传并打印，形如 cloud://环境ID.桶名/garden/anim/）
  // 留空用单张图 + CSS 步态
  animArt: 'cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/garden/anim/',
}
