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

  return { getImageUrl, deleteFile }
}

module.exports = { createStorage }
