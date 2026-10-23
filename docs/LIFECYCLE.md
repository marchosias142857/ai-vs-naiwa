# M0 生命周期

- `services/LifecycleService.ts` 只使用浏览器 API；`game/bindLifecycle.ts` 连接 Phaser。
- 仅在 `(pointer: coarse) and (hover: none)` 匹配且竖屏时使用 DOM 遮罩（z-index 5），更新提示仍在 z-index 10。DOM 在引擎停帧时仍可布局、接收触摸和刷新；四边避让 safe-area。
  桌面竖长窗口继续运行，保持 Scale.FIT 居中和上下留边。监听媒体查询的 change 以适配二合一设备切换输入模式，销毁时移除监听。
- 浏览器 resize / orientationchange / visibilitychange 维护自动暂停原因；`setManualPaused()` 持有独立手动原因。
- 使用 Phaser 4.1 类型和源码确认过的 `game.loop.sleep()` 停止 RAF，停止物理、场景更新、动画及 TimerEvent。
  不只依赖浏览器后台节流。READY 早于 loop.start，因此竖屏冷启动在首个 postrender 时停止循环。
- 恢复前 `resetDelta()`，随后 `wake()`，不把暂停时长算进物理/TimerEvent 的下一帧。
  TweenManager 自己使用墙钟，因此恢复时同步其公开 `startTime` / `prevTime` 时基，保持 tween 的相对时间。
- 仅唤醒本模块停止的循环；不调用 `game.resume()` 或 `scene.resume()`，不清除已有 Game/Scene 暂停。
  M4 全局手动暂停使用 `lifecycle.setManualPaused(true/false)`；若暂停菜单本身是 Phaser 场景，则只暂停战斗场景，保留菜单更新。
  其他模块不能在本模块已 sleep 后再次裸调用 loop.sleep 来表达手动原因，否则无法区分所有权。
- 暂停时关闭 Phaser 指针/键盘输入并重置按键和指针，恢复其原启用状态；DOM 更新按钮仍可操作。
- `onHidden` 回调在后台状态转换且循环暂停后同步调用，M4 在这里接存档。当前不写快照。
- 第一次可信 touchend / click / keydown 的捕获回调中，同步调用空的 `unlockAudio()` 并移除全部手势监听。
  touchend 与后续合成 click 不会重复调用。M5 在该调用栈中创建/恢复 AudioContext，不能先 await。
- 玩法倒计时使用 Phaser TimerEvent 或累计 delta，不能用 Date.now / performance.now / Clock.now 相减；这些墙钟会跨过暂停区间。

依据：安装包 `phaser.d.ts`、`core/TimeStep.js`、`core/Game.js`、`tweens/TweenManager.js`；
[Phaser TimeStep](https://docs.phaser.io/api-documentation/class/core-timestep)、
[WebKit 用户手势约束](https://webkit.org/blog/6784/new-video-policies-for-ios/)。

## 验收

运行 `npm run check`、`npm run test:e2e`（先停止旧 preview，避免复用旧构建）。
单测覆盖原因重叠、手动暂停保留、首次手势同步且只调用一次、清理监听、循环所有权及恢复顺序；
E2E 覆盖桌面竖窗口继续运行、触屏竖屏冷启动、输入模式切换、转回横屏、帧号/场景时钟冻结、键盘阻断、模拟后台状态及竖屏更新按钮可点击。
后台用例模拟 document 状态并触发真实监听，不等同于 iOS 切应用真机测试。

手动用 `npm run preview` 打开 `/?scene=Game&seed=42`，旋转手机及切后台/回前台。
桌面可在 Console 读取 `window.__AVN__.lifecycle` 的 paused、loopRunning、frame、sceneTime。
分别记录 iOS Safari / Android Chrome 真机结果；M0 只有空音频钩子，不声称已经验证实际音频播放。
