# 统一图片 UI v1

#117 的 imagegen 原稿，生成于 2026-10-29 任务期间。由 GPT 按项目既有像素美术制作，无外部素材依赖；负责人画面验收尚未完成。

- `sources/frames-v1.png`：六款面板/按钮状态原稿。
- `sources/icons-v1.png`：36 图标原稿，实际 1254²，不能按等分网格裁切。
- `sources/controls-v1.png`：六种触控控件；来自 controls 生成后按 controlsAlpha 指令的透明底编辑结果。
- `prompts.json`：每次生成/编辑的完整提示词；透明背景参数均为 true。
- `manifest.json`：原稿 SHA-256、实测源矩形、运行格尺寸、输出 SHA/字节数。
- `export.mjs`：浏览器 Canvas 机械裁切/最近邻等比缩放，不重画原稿。运行 `node art-src/ui/export.mjs`；没有标准 Playwright Chromium 时可通过 `UI_CHROMIUM` 指定已安装浏览器。

运行图片在 `public/assets/ui`，只打包标准尺寸切片，原稿不进入 PWA。完整视觉规范、覆盖清单及可复用提示词见 [UI 美术手册](../../docs/UI_ART_STYLE.md)。
