# M1 输入层接线与验收（#12）

`InputScene` 是独立 UI 场景，战斗场景启动/退出时一并启停。它持有 `InputController`，统一接收指针与键盘输入；战斗场景的 Phaser input 关闭，避免触屏控件穿透。Phaser 自带 GamepadPlugin 负责手柄读取，输入层统一做 12% 径向死区。

#15 接线：取得 UI 场景的 `controls`，在战斗 update 的 `step` 前调用 `controls.sample(playerX, playerY)`，坐标取玩家脚底世界坐标。每个游戏帧只采样一次，UI 的兜底采样不会吞掉边沿。只当帧读返回的 InputFrame，不保留其引用。当前灰盒尚未接入移动与开火，因此可用 `window.__AVN__.input` 验收输入值。

- WASD/方向键移动，鼠标瞄准与左键持续开火；Space/Q/E 为单帧边沿。
- 左触屏区浮动摇杆，右侧按住开火；各控件使用独立 pointer ID。Pointer capture + window pointerup 处理画布外释放，cancel/lostcapture、失焦、后台、resize 均清空。
- 手柄左摇杆移动、右摇杆瞄准、RT 开火、Start 暂停。恢复后须回中一次；浏览器手柄 API 需要 HTTPS 或 localhost，普通局域网 HTTP 不保证可用。
- Esc/暂停键只暂停 Game；UI 持续运行，可按 Esc/Start 或点击继续。恢复前校正战斗场景 TweenManager 时基。自动生命周期暂停仍停整个循环，不清除手动暂停状态。
- 控件尺寸取 CSS px / canvas 实际缩放，安全区不重复扣除。PWA 提示顶部为实际 canvas.top + 56px。

自动化：单测验证边沿、复用、死区、斜向归一化与多指所有权；Playwright 验证键鼠/多指/手柄插件及暂停恢复。手柄用模拟浏览器 Gamepad 数据接入真实 Phaser 插件，不等于真实硬件验收。

手动：`npm ci && npm run build && npm run preview -- --host 0.0.0.0`，打开 `?scene=Game&seed=42`。手机检查双指同时移动/射击、移出画布松开、系统取消、旋转、切后台后无残留；暂停后切后台再返回仍为暂停。分别在 iOS Safari、Android Chrome 与真实手柄验收。当前图像为占位，正式视觉由 Claude 主导。
