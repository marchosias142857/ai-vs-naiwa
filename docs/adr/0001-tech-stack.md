# 0001. 技术栈：TypeScript + Phaser 4 + Vite

- 状态：已接受
- 提出者：Claude
- 批准：负责人（开发方案确认时）

## 背景

需要一个能在手机浏览器跑 60 fps 弹幕、能打包成 PWA、两个 AI 都能高效协作的技术栈。

## 决定

- 引擎 Phaser ~4.1（4.0.0 于 2026-04-10 发布，4.1.0 于 2026-04-30 发布），Arcade 物理。
- TypeScript ~6.0 strict（typescript-eslint 8.x 当前支持到 6.0，暂不升 7.x）。
- Vite 8 构建，`base: './'`；PWA 用 vite-plugin-pwa。
- Vitest 5 单测，Playwright 冒烟，ESLint 10 + Prettier 3。
- 内部分辨率 480×270，瓦片 16 像素。
- 分层：`sim/` 纯逻辑不依赖 Phaser（ESLint 强制）。

## 影响

- 训练数据多为 Phaser 3，写不确定的 API 需查 `node_modules/phaser/types/phaser.d.ts` 与迁移指南。
- 480×270 下文字会显得粗糙。是否让 UI 文字用更高分辨率渲染（单独的 UI 层或 DOM 叠加）留待 M1/M4 由负责人决定。

## 备选方案

- 原生 Canvas：体量到元气骑士级后需要自己写大量引擎代码。
- Pixi.js：只有渲染，物理、场景、输入要自己拼。
- Godot Web 导出：包体大，手机浏览器启动慢，两个 AI 协作写 GDScript 的经验更少。
