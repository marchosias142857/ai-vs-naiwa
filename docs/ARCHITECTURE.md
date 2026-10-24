# 架构

核心规则：**sim 决定发生什么，game 决定看起来怎样。** 本文描述 demo 当前实现；完整评审索引见 [demo-overview.md](demo-overview.md)。

## 1. 分层与依赖

- `data/` 只定义玩法常量和 schema，不依赖其他层。
- `sim/` 只依赖 data，不导入 Phaser、game、services 或 debug。
- `game/` 依赖 sim、data、services，负责 Phaser 物理、绘制与 DOM UI。
- `services/` 只依赖浏览器 API，负责存储、设置、音频和页面生命周期。
- ESLint 与 architecture 单测同时检查边界；zod 只在测试/校验中运行，不进入生产包。

## 2. 一局的模块与生命周期

| 模块                             | 职责                                                              |
| -------------------------------- | ----------------------------------------------------------------- |
| `MenuScene` / `MenuPanel`        | 新局、检查点继续、战绩与设置；有存档时全局 Enter 继续，新局需确认 |
| `GameScene` / `DemoSession`      | 组装本局 sim、地图、输入、池、反馈、HUD；升级与胜负状态接线       |
| `DungeonRun` / `generateDungeon` | 确定性拓扑、有限波次、房间锁门、清房、层间推进、胜负              |
| `RoomDirector`                   | bridge 之后消费当步刷怪命令，按楼层和子系统派生种类/位置随机流    |
| `CombatWorld`                    | 角色状态、AI、弹道、伤害、资源、技能、自动瞄准                    |
| `CombatBridge` / `RoomArena`     | 输入边沿锁存、物理同步、碰撞反馈、墙体复用、门口切房、地图查询    |
| `NavigationGrid`                 | 固定四邻网格，每个半径缓存 blocked 与流场，目标格由坐标计算       |
| `LootSystem` / `DemoObjects`     | 固定楼层槽位、自动物资拾取、显式原槽换枪；只展示当前房间的武器    |
| `CombatFeedback` / `CombatAudio` | 事实事件到预热反馈/音频；死亡表现结束才回收角色                   |
| `DemoHud` / `InputScene`         | 功能 HUD、地图、选择/结算；渲染帧输入和触屏操作                   |
| `RunPersistence`                 | 楼层入口检查点，胜负清档并记录一次战绩                            |

关闭场景时清理 WORLD_STEP、PRE_UPDATE、EventBus 订阅、DOM/手柄菜单、碰撞器与各池。重来新建 CombatWorld；InputScene 实例可复用，但 create 重置布局缓存。原 M1 入口保留在 `?scene=Game&room=arena`。

## 3. 时间、输入与物理（ADR 0004）

每个渲染帧只 sample 一次。InputScene 按其输入插件时序采样，战斗 PRE_UPDATE 取得缓存帧交给 bridge。物理后的 GameScene.update 发布玩家当前位置作为下一帧瞄准原点。

Arcade 完成本物理步移动与 overlap 后，WORLD_STEP 依注册顺序执行：

1. bridge：子弹寿命 → 同步 body.center → sim.step(dt, input) → 清边沿 → 应用速度/阶段 → 消费 spawns。
2. CombatFeedback：表现计时，死亡结束后 finishDeath。
3. DemoSession：导演 → 拾取 → 走门/出口 → 升级/结算计时。

0 个物理步的渲染帧保留边沿，多个物理步只给第一步。DOM 动作使用 pointerdown + preventDefault，仍经过渲染采样和 bridge 锁存。技能/切枪/交互按钮跟随 touchVisible，暂停或物理暂停时禁用。ActorView/BulletSpawn/StepResult 均为只读复用视图，消费者不跨帧保存。

## 4. 规则、弹道与事件

武器和敌方攻击共享 `FirePattern(ctx, sink)`：往预热 BulletSpawn 输出池写入，不返回新数组；开火上下文、弹丸记录、事件 payload 复用。规则给期望速度，Arcade 决定位置。碰撞调用 hitActor/hitWall/contact，寿命结束调用 releaseBullet。

| 事件                                  | 发送方      | 订阅方                               |
| ------------------------------------- | ----------- | ------------------------------------ |
| `entity:spawned` / `entity:activated` | CombatWorld | 实体表现/预警                        |
| `entity:damaged` / `entity:died`      | CombatWorld | 反馈、音效、掉落、DungeonRun 统计    |
| `weapon:fired` / `bullet:hit`         | CombatWorld | 闪光、命中反馈、音效                 |
| `room:entered` / `room:cleared`       | DungeonRun  | 场景、清房奖励、音效                 |
| `run:ended`                           | DungeonRun  | 结束通知；GameScene 读取状态显示结算 |

单次子弹命中依次 damaged →（致命时）died → bullet:hit，critical 一致。EventBus 订阅写时复制，emit 遍历开始时的数组快照。

## 5. 固定容量与随机

预热 500 子弹、31 规则角色/物理角色、100 瞬时反馈、64 掉落槽/表现、8 内墙和 8 音频声部。预警使用固定图形，不依赖易满的瞬时反馈池。同步事件内回收的角色记录等外层调用结束再复用，防止同次命中串号。

武器掉落记录房间编号，换房保留、换层清空；普通物资换房清空。普通掉落不能占用武器预留槽。拾取第二把武器时，旧第二把直接放回原地面槽并移到脚下，满池也无需新增槽；手枪不掉。

所有随机走 Random。地图 `map:${floor}`、布局 `layout:${floor}:${room}`、升级 `upgrades:${floor}`、掉落 `loot:${floor}`、刷怪 `encounters:${floor}` 独立 fork；刷怪再拆种类/位置。后面三条流每层重置，同一楼层入口的继续与连续推进一致。战斗散布/暴击流仍是局级，不承诺逐帧回放。

## 6. 存储与浏览器生命周期

| 当前存储          | 内容/时机                                                                        |
| ----------------- | -------------------------------------------------------------------------------- |
| `avn.floor.v1`    | 楼层入口种子、升级、装备（第二槽可空）、资源与成绩；开局/换层保存，死亡/胜利清除 |
| `avn.profile.v1`  | 胜负局数、最高楼层、击杀；只在胜负时计入，中途退出不计                           |
| `avn.settings.v1` | 语言、音效、受击闪光；修改即写                                                   |

当前使用带版本的 localStorage，失败/损坏不会阻止游玩。继续从楼层入口开始，不恢复退出时房内战况。存档 v2（完整局面、pagehide/后台保存）在 #33 合并后单独做，由 Claude 起草 ADR 和 sim 保存/恢复，GPT 接存储和菜单。

竖屏触屏设备或 visibilitychange 自动暂停；不把暂停误写为已经保存完整快照。音频仅在真实手势首次解锁，暂停/后台 suspend，恢复失败等下一次手势重试。PWA 使用 Workbox，更新由用户明确刷新，不自动打断战斗。

## 7. 参数、预算与验收

内部分辨率 480×270，16 px 瓦片，Scale.FIT，pixelArt。现有功能视觉是灰盒，正式布局/美术/动画仍由 Claude 出方案、负责人确认。

性能目标：中端安卓平均 ≥55 fps、最低 ≥45 fps；战斗 draw call ≤30、内存 ≤300 MB、包体 ≤8 MB（不含音乐）。这些是目标，不是浏览器模拟已经证明的结果；iOS/Android 真机、带柱子房间+混合怪记录到 #18。

验证用 Vitest（数据、边界、随机、规则、导航、池）、Playwright（真实 Arcade、菜单/输入/存储/生命周期、离线和连续更新）及负责人真机试玩。具体记录见 [demo 验收](testing/demo-acceptance.md)。
