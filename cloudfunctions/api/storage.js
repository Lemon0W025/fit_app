// 云存储：把打卡照片变成模型能读的地址，以及删除照片

function createStorage(cloud, config) {
  async function getImageUrl(fileID) {
    if (config.imageMode === 'base64') {
      const res = await cloud.downloadFile({ fileID })
      return `data:image/jpeg;base64,${res.fileContent.toString('base64')}`
    }
    const res = await cloud.getTempFileURL({ fileList: [fileID] })
    const file = res.fileList && res.fileList[0]
    if (!file || !file.tempFileURL) {
      throw new Error(`取不到图片临时链接：${(file && file.errMsg) || 'unknown'}`)
    }
    return file.tempFileURL
  }

  async function deleteFile(fileID) {
    await cloud.deleteFile({ fileList: [fileID] })
  }

  // 亲友看板：别人的打卡照片要换成临时链接才看得到（一次最多换 50 个）。返回 { fileID: 链接 }，换不到的没有
  async function getPhotoUrls(fileIDs) {
    const out = {}
    const ids = [...new Set((fileIDs || []).filter(Boolean))]
    for (let i = 0; i < ids.length; i += 50) {
      const res = await cloud.getTempFileURL({ fileList: ids.slice(i, i + 50) })
      ;(res.fileList || []).forEach((f) => {
        if (f && f.fileID && f.tempFileURL) out[f.fileID] = f.tempFileURL
      })
    }
    return out
  }

  return { getImageUrl, deleteFile, getPhotoUrls }
}

module.exports = { createStorage }
