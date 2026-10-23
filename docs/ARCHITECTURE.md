# 架构

核心规则：**`sim/` 决定发生什么，`game/` 决定看起来怎样。**
`sim/` 不 import Phaser，因此能用 Vitest 秒级测试；`game/` 把 Phaser 的物理碰撞和输入翻译给 `sim/`，再把结果画出来。

## 1. 分层与依赖

```
            ┌───────────────┐   import   ┌───────────────┐   import   ┌──────────┐
            │ game/ 表现层  │ ─────────▶ │ sim/ 纯逻辑   │ ─────────▶ │ data/    │
            │ (Phaser)      │ ──────────────────────────────────────▶ │ 数据     │
            └──────┬────────┘            └───────┬───────┘            └──────────┘
                   │ import                      ✕ 禁止 import Phaser（ESLint）
            ┌──────▼────────┐            ┌───────▼───────────────────────────┐
            │ services/     │ ─────────▶ │ Phaser 4 / 浏览器 API              │
            └───────────────┘            └───────────────────────────────────┘
```

运行时数据流：输入 → `game/input` 生成 `InputFrame` → `sim/` 计算子弹、伤害与事件 → `game/` 用对象池生成子弹并播放表现。

## 2. 关键参数

- 内部分辨率 **480×270**（16:9），`pixelArt: true`，`Scale.FIT` 居中；瓦片 **16×16**。
- 横屏：manifest `orientation: landscape`；iOS 无法锁方向，竖屏时显示「请旋转设备」遮罩并暂停。
- 刘海屏：`env(safe-area-inset-*)`。
- 音频：首次触摸后解锁（iOS）。
- 切后台（`visibilitychange`）自动暂停并存局内快照。

### 性能预算（硬指标）

| 指标      | 目标                            |
| --------- | ------------------------------- |
| 帧率      | 中端安卓机稳定 60 fps，最低 45  |
| 同屏子弹  | 400（全部对象池）               |
| 同屏敌人  | 30                              |
| 包体      | ≤ 8 MB（不含音乐），首屏 3 秒内 |
| 内存      | ≤ 300 MB                        |
| Draw call | 战斗中 ≤ 30（依赖图集）         |

## 3. 数据驱动

武器、敌人、Buff 都是数据（`src/data/`，格式见 `DATA_SCHEMA.md`）。行为差异用**注册表**表达：

```ts
// src/sim/weapons/patterns/types.ts（M3）
export interface FireContext {
  origin: Vec2;
  aimAngle: number;
  weapon: WeaponDef;
  stats: ResolvedStats;
  rng: Random;
  owner: Team;
}
export interface BulletSpawn {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  sprite: string;
  behavior?: string;
}
export type FirePattern = (ctx: FireContext) => BulletSpawn[];
// registerPattern('spread', spreadPattern)
```

`sim` 只返回「要生成哪些子弹」，`game/pools/BulletPool` 负责生成。敌人攻击复用同一套弹道。AI 行为（M3）同理：`sim/ai/behaviors/` 注册表 + 有限状态机。

## 4. 事件总线

`sim/core/EventBus.ts`，事件类型集中在 `sim/core/events.ts`（共享契约）。场景关闭时 `bus.clear()`。

| 事件                             | 发送方         | 典型订阅方                 |
| -------------------------------- | -------------- | -------------------------- |
| `room:entered` / `room:cleared`  | RoomController | 刷怪、门、小地图、存档     |
| `entity:damaged` / `entity:died` | CombatBridge   | 伤害数字、音效、掉落、统计 |
| `player:weaponChanged`           | WeaponHolder   | HUD                        |
| `run:started` / `run:ended`      | RunState       | 场景切换、结算             |

## 5. 对象池

子弹、特效、伤害数字、金币全部池化，用完 `release()`；战斗循环里禁止 `new` / `destroy`。预热数量见 `src/config.ts` 的 `POOL_SIZES`。

## 6. 输入抽象（M1）

每帧产出一份 `InputFrame`（定义在 `src/sim/core/types.ts`，约定见 ADR 0002）：`move`、`aim`（`null` 表示自动瞄准）、`fire`（按住），以及本帧刚按下的 `skillPressed` / `swapPressed` / `interactPressed` / `pausePressed`。玩家实体只读它；生成方每帧复用同一个对象。

- 桌面：WASD 移动，鼠标瞄准，左键射击，Space 技能，Q 切枪，E 交互，Esc 暂停。
- 手机：左下动态摇杆移动；右下射击键按住即对自动瞄准目标开火，技能、切枪键围绕射击键。
- 手柄：左摇杆移动，右摇杆瞄准，RT 射击。

## 7. 随机与可复现

`sim/core/Random`（mulberry32）。每局一个种子；地图、掉落、刷怪可复现；子系统用 `fork('label')` 得到独立流。唯一允许的非确定性来源是 `freshSeed()`。

## 8. 存档（M4 / M6）

| 存档          | 内容                                 | 时机                                 |
| ------------- | ------------------------------------ | ------------------------------------ |
| `profile`     | 宝石、解锁、天赋、图鉴、统计         | 结算                                 |
| `settings`    | 音量、语言、自动瞄准、摇杆位置、画质 | 修改时                               |
| `runSnapshot` | 楼层、角色、武器、Buff、金币、种子   | 进入新关、切后台；只能从关卡开头续玩 |

每个存档带 `version`，读取时依次执行迁移函数。IndexedDB 为主，localStorage 兜底；提供导出/导入存档码（防 iOS 清理）。

## 9. 测试

| 层     | 工具                             | 必测                                                                    |
| ------ | -------------------------------- | ----------------------------------------------------------------------- |
| `sim/` | Vitest                           | 伤害公式、Buff 叠加、弹道输出、地牢连通性与种子复现、掉落分布、存档迁移 |
| 数据   | `scripts/validate-data.ts`（M3） | ID 唯一、引用存在、数值范围                                             |
| 冒烟   | Playwright（桌面 + 横屏手机）    | 启动、菜单、进入战斗、控制台零报错                                      |
| 手感   | 负责人真机试玩                   | 每个里程碑结束                                                          |

## 10. 调试工具

URL 参数见 `src/debug/params.ts`。`?debug=1` 显示 FPS、种子、对象数（之后加实体数、子弹数、池占用、碰撞框、AI 状态）。
调试快捷键（M1 起，仅调试模式）：F1 碰撞框、F2 清房、F3 随机武器、F4 下一关。
