// 云开发环境 ID：云开发控制台 → 设置 → 环境 ID（形如 cloud1-xxxxxx）
module.exports = {
  envId: 'cloud1-d0gc0a24t697e8d8b',
  // 营地底图切块在云存储里的 fileID 前缀（npm run wx:art 上传后打印，形如 cloud://环境ID.桶名/camp/base-vN/；日景 t00～t33.jpg、夜景 night-t00～）；留空就只有包里垫的整张画（768 宽的低清版）
  campArt: 'cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/camp/base-v2/',
  // 装饰块的前缀（…/camp/decor-vN/）；只有 utils/decor-art.js 列的（画好了的）用它，别的和留空都用包里的占位块
  decorArt: 'cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/camp/decor-v1/',
  // 帐篷 / 锅 / 木盖 / 提灯抠图层和篝火逐帧图的前缀（…/camp/cut-vN/，tent.webp、pot-0～3.webp、lid / lantern.webp、fire.jpg，夜里加 night-）；留空用包里的小图
  cutArt: 'cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/camp/cut-v5/',
  // 宠物动画拼图的前缀（…/camp/anim-vN/，<id>-a.png / <id>-b.png）；留空用单张图 + CSS 步态
  animArt: 'cloud://cloud1-d0gc0a24t697e8d8b.636c-cloud1-d0gc0a24t697e8d8b-1514373455/camp/anim-v1/',
}
