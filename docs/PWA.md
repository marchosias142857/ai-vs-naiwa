# M0 PWA 外壳与验收

`vite-plugin-pwa 2.0.0` 使用 `generateSW`，`workbox-build 7.4.1` 负责生成 SW，
`workbox-window 7.4.1` 负责注册与更新生命周期。三者为精确版本；游戏原有依赖版本未升级。
实现依据：[Vite 相对 base](https://vite.dev/guide/build#relative-base)、
[插件更新提示](https://vite-pwa-org.netlify.app/guide/prompt-for-update)及安装包中的注册模块类型。

## 路径与缓存

- `base: './'`，manifest 的 id/start_url/scope 以及 SW scope 均为相对目录；图标也使用相对路径。
- `src/main.ts` 仅新增一行注册模块导入；没有修改 Phaser 场景、sim 或共享契约。
- 缓存 HTML、打包后的 JS/CSS、图片、JSON 和 woff2；不缓存源码映射与音乐。
- 图标使用仓库自制的 AI 字样占位图，SVG 源文件在 `public/icons/placeholder.svg`。
  普通 192/512 图标和 maskable 512 图标均为不透明背景，内容位于中心安全区域。
- 首次联网完成 SW 安装后才能离线。浏览器清除站点数据后需要重新联网缓存。
- 开发服务器不注册 SW；验收使用 `npm run build && npm run preview`。

## 更新

新 SW 安装后保持 waiting，仅展示「有新版本 / 点击刷新 / 稍后」。
启动、返回前台、恢复联网及每小时检查更新；断网检查失败不会阻止游戏。
玩家点击后才激活并刷新当前页面；其他标签页只提示，不强制刷新。
M0 没有局内存档，点击刷新会重新进入当前 URL 对应场景；存档属于后续里程碑。

## 自动验收

运行 `npm run check` 和 `npm run test:e2e`。除原有冒烟外，桌面及横屏手机视口各覆盖：

1. 同一份生产构建挂在 `/ai-vs-naiwa/`，检查 manifest、图标、SW scope 和 Chromium 安装条件。
2. SW 接管后断网刷新菜单；关闭页面后断网新开页面，进入 `?scene=Game&seed=7`。
3. 同一配置真实构建第二、第三个版本，验证连续发布时的等待提示、「稍后」、主动刷新及其他标签页不被刷新。

截图保存在 `test-results/` 下的 `pwa-offline.png` 和 `pwa-update.png`。
这些检查不等同于实际安装或 iOS 真机测试，实际浏览器与结果在 PR 中记录。

## 合并部署后的手动验收

1. Chrome 打开 https://marchosias142857.github.io/ai-vs-naiwa/?seed=42 。
2. 开发者工具 → Application → Manifest：检查名称、图标及 start_url/scope 均在 `/ai-vs-naiwa/` 下。
   Service Workers 中确认 SW 地址为 `/ai-vs-naiwa/sw.js`、状态 activated；不要开启 Update on reload 或 Bypass for network。
3. 使用浏览器提供的安装入口安装。首次加载完成后关闭应用，断开网络，再从应用图标启动；验证菜单、进入 Game 和刷新。
4. iPhone 用 Safari 打开相同地址 → 分享 → 添加到主屏幕。启动一次完成缓存后关闭，打开飞行模式并确认 Wi-Fi 已关闭，再从主屏幕启动。
5. 截图记录浏览器/系统版本、Manifest、SW、离线启动结果。将来发布更新时保留旧页面，再返回前台：应出现提示，点击前游戏不重载。
