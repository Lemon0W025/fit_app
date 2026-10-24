# 暖暖营地 · 第 1 批 A

用户已选定候选 **03**（绿色屋脊帐篷），以下四张是本批正式交付：

| 文件 | 尺寸 | 内容 |
| --- | --- | --- |
| `camp.png` | 1024×1024 | 选定的日景，逐字节复制自 `candidates/03.png` |
| `camp-hd.png` | 3641×3641 | 16 块 image-to-image 重绘后羽化合并的日景高清 |
| `night.png` | 1024×1024 | 以 `camp.png` 为底，只改变光线的同构图夜景 |
| `night-hd.png` | 1903×1903 | 4 块 image-to-image 重绘后羽化合并的夜景高清 |

全部生成使用内置 image_gen，传入 `art/guide/style-camp.jpg` 作为画风参考；画风为柔和手绘 2D 插画。用户已同意将工具返回的 1254×1254 原生图等比导出为 1024×1024，并保留原生图。高清整图来自真实分块重绘，未用底图放大补缺块。

## 记录与原图

- `candidates/generation.json`：四版候选的完整提示词和来源，选定项为 03。
- `detail/generation.json`：16 张日景重绘的逐块提示词、来源和校验；`detail/native/` 保留原生输出。
- `night-generation.json`：夜景完整提示词、原生来源，以及帐篷、锅火区、食盆的日夜边缘对齐检查；三处最佳位移均为 `[0, 0]` 像素。
- `night-detail/generation.json`：4 张夜景重绘的逐块提示词、来源和校验；`night-detail/native/` 保留原生输出。
- `native/night.png`：夜景原生输出；选定日景的原生输出位于 `candidates/native/03.png`。
- `selected-generation.json`：正式交付清单与最终验证摘要。
- `variants/` 及其他旧文件为保留的历史版本，后续接入请使用上表四张正式交付。

## 工具修正与验证

`detail_crops.py` 的行数计算已修复浮点误差，避免 `--cols 2` 意外切成 3 行；64 组尺寸、列数、重叠比例组合验证通过。

夜景实际使用 `--cols 2 --overlap 0.14 --dir night-detail`。14% 重叠使 4 张 1024×1024 重绘合并为 1903×1903，满足清单至少 1900 像素的要求；默认 15% 重叠合并后只有约 1893 像素。

四张正式图均通过 `scripts/art/check_art.py`；20 张重绘图分别通过绘画比例检查和精确 1024×1024 PNG 检查。仓库 `npm test`：233 项通过，0 项失败。

第 1 批 A 到此结束。等待按选定画面量取场景数据、更新 `shared/camp.js` 后，再开始第 1 批 B。
