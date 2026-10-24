// 云开发环境 ID：云开发控制台 → 设置 → 环境 ID（形如 cloud1-xxxxxx）
module.exports = {
  envId: 'cloud1-d0gc0a24t697e8d8b',
  // 营地底图切块在云存储里的 fileID 前缀（npm run wx:art 上传后打印，形如 cloud://环境ID.桶名/camp/base/；日景 t00～t33.jpg、夜景 night-t00～）；留空用包里的白模
  campArt: 'cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/camp/base/',
  // 装饰块的前缀（…/camp/decor/）；留空用包里的占位块
  decorArt: '',
  // 帐篷和暖暖锅抠图层的前缀（…/camp/cut/，tent.png、pot-0.png～pot-3.png）；留空用包里的占位图
  cutArt: 'cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/camp/cut/',
  // 宠物动画拼图的前缀（…/camp/anim/，<id>-a.png / <id>-b.png）；留空用单张图 + CSS 步态
  animArt: '',
}
