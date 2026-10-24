# 输入层接线与验收

`InputScene` 是独立 UI 场景，战斗场景启动/退出时一并启停。它持有 `InputController`，统一接收指针与键盘输入；战斗场景的 Phaser input 关闭，避免触屏控件穿透。Phaser 自带 GamepadPlugin 负责手柄读取，输入层统一做 12% 径向死区。

InputScene 按输入插件时序每渲染帧采样一次；战斗场景 PRE_UPDATE 取得缓存输入交给 `bridge.setInput(frame)`。玩家位置由物理后的 GameScene.update 发布，坐标取身体中心（ADR 0023），不再取脚底。只当帧读返回的 InputFrame，不保留其引用。CombatBridge 复制并锁存边沿到下一个 WORLD_STEP，零物理步保留，多物理步仅第一步消费。`window.__AVN__.input` 可用于检查输入值。

- WASD/方向键移动，鼠标瞄准与左键持续开火；Space/Q/E 为单帧边沿。
- 左触屏区浮动摇杆，右侧固定瞄准轮盘；每次按下先不射击，拖出死区立即朝拖动方向首发，留在死区 120 ms 后朝当前面向首发，随后按武器射速连发，松手停火。等待时 `InputFrame.fire=false`，弹幕和近战共用，鼠标/手柄不延迟。各控件使用独立 pointer ID；pointer capture + window pointerup 处理画布外释放，cancel/lostcapture、失焦、后台、旋转及画布尺寸实际变化时清空；同尺寸 resize 不松开摇杆。
- 手柄左摇杆移动、右摇杆瞄准、RT 开火、Start 暂停。恢复后须回中一次；浏览器手柄 API 需要 HTTPS 或 localhost，普通局域网 HTTP 不保证可用。
- 手动、生命周期、升级、终局、恢复分别持有暂停原因；UI 在手动暂停时仍可接收继续操作。暂停、保存和恢复清理输入层与 bridge 边沿。战斗现场恢复倒计时期间 sim/物理冻结，其他暂停原因解除后重启完整倒计时；不会绕过已有手动暂停。
- 控件尺寸统一在 `src/game/fx/params.ts`，绘制、判定和测试共用。尺寸取 CSS px / canvas 实际缩放，安全区不重复扣除。PWA 提示顶部为实际 canvas.top + 56px。

自动化：单测验证边沿、复用、死区、斜向归一化与多指所有权；Playwright 验证键鼠/多指/手柄插件及暂停恢复。手柄用模拟浏览器 Gamepad 数据接入真实 Phaser 插件，不等于真实硬件验收。

手动：`npm ci && npm run build && npm run preview -- --host 0.0.0.0`，打开 `?scene=Game&seed=42`。手机检查双指同时移动/射击、轮盘首发方向、移出画布松开、系统取消、旋转、切后台后无残留；暂停后切后台再返回仍为暂停。分别在 iOS Safari、Android Chrome 与真实手柄验收。当前 demo 已使用实际图集，截图与待验真机范围见 [当前交付](demo-production-acceptance.md)。
