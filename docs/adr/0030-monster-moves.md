# ADR 0030：怪物招式、最终 Boss 奶怪与房间互动

- 状态：已批准（负责人合并 PR #93）
- 提出者：Claude
- 批准：负责人（合并即批准）

## 背景

负责人 2026-10-24 要求：

- 怪物 AI 参考泰拉瑞亚、元气骑士、贪婪地牢与类幸存者游戏，并且 AI 要和外观、动画融为一体；
- 负责人绘制的奶怪作为关底 Boss，战斗要有趣，并能和地图互动，需要死亡动画；
- 其他怪物用 Claude 原创的抽象搞怪形象，整体风格参考元气骑士。

原有怪物只有追击、保持距离、炮台和冲锋四种行为，每种只有一张静态图。表现层也拿不到「正在蓄力什么招」这类信息，没法让动画、预警和招式对上。

## 决定

### 1. 行为与招式（sim）

新增 `src/sim/ai/EnemyAi.ts`。招式的落地效果通过 `AiHost` 交给 CombatWorld 执行，包括开火、爆炸、舌击、召唤、放区域、落石、撞击判断、自爆与事件；AI 本身不碰事件总线。

- `EnemyDef.behavior` 新增 `hop`、`lash`、`burrow`、`strafe`；已有的 `summoner`、`suicide` 实现了。
- 招式参数都放在可选字段里，每种怪的外观都对应它的招式：

| 字段              | 怪物     | 招式                                            |
| ----------------- | -------- | ----------------------------------------------- |
| `hop`             | 弹簧蛙   | 蓄力 → 腾空 → 落地放圈，参考泰拉瑞亚史莱姆      |
| `lash`            | 舌头蛙   | 蓄力瞄准，最后 0.25 秒锁定方向，命中后拉人      |
| `summon`          | 蛙卵团   | 召唤子嗣，有数量上限                            |
| `fuse`            | 炸弹蛙   | 贴近后鼓胀，到时爆炸并结束自己                  |
| `burrow`          | 地洞蛙   | 地下潜行 → 冒头预警 → 出土放圈 → 停留后再钻回去 |
| `strafe` + `spin` | 街舞蛙   | 横移随机换向，定时旋转打螺旋弹                  |
| `split`           | 叠罗汉蛙 | 死亡时分裂                                      |
| `gas`             | 放屁蛙   | 留下毒气区域                                    |
| `dash.trigger`    | 大头蛙   | 先追到 trigger 距离内才蓄力扑咬                 |

- 定时特殊招式：`specials` 与 `specialEvery`，阶段可以覆盖 `specials` 和 `rocks`。
  - 可用招式：`hop`、`lash`、`summon`、`bump`、`spin`、`rain`。
  - `bump` 为挺肚冲撞。冲撞中实际位移明显小于预期就算被挡：贴着 `bounds` 边界算撞墙，只停下；否则算撞上石柱或石块，眩晕 `stun` 秒，眩晕期间受到的伤害乘 `bonus`，并撞碎前方的石块。
  - `rain` 为石块雨；`rock` 是石块参数；`hop.rocks` 与 `hop.puddle` 让落地时砸石块、留下奶潭。
- `loot`：掉落倍率。分裂和召唤出来的蝌蚪崽为 0，不掉落，也不消耗掉落随机数。
- 旧的追击、保持距离、炮台、冲锋仍由 `moveEnemy` 计算，结果与改动前一致。常规射击从 CombatWorld 原样移到 `EnemyAi.shootRegular`。

### 2. 区域与石块（sim）

- `CombatWorld.zones` 为固定槽位，数量见 `BALANCE.zoneCapacity`。
  - `poison`：每 `tick` 秒伤害另一阵营。
  - `milk`：让另一阵营的玩家按 `BALANCE.milkSlow` 减速，只在 `applyVelocity` 里乘倍率，不改基础速度。
- `CombatWorld.rocks` 同样是固定槽位（`BALANCE.rockCapacity`）。先预警 `fall` 秒，落地时伤害落点里的玩家，之后作为障碍留 `life` 秒。落地的石块在 sim 的视线判断里也算遮挡。
- 新增 `CombatWorldOptions.bounds`：房间内边界，用来限制石块落点、区分撞墙和撞柱。
- 新增 `clearHazards()`：换房时由 RoomArena 调用。带 `rock` 的 Boss 倒下时，sim 也会自己清掉区域与石块。
- 新增 AI 专用随机流 `fork('ai')`，负责换向、落点和放圈起始角，存档为 `rng.ai`。

### 3. 共享契约

- `ActorView` 新增：
  - `pose`：idle / move / windup / attack / air / recover / buried / spin，表现层据此选动画；
  - `lift`：腾空的表现高度；
  - `aim`：招式锁定的方向；
  - `move`：当前招式，用来画对应的预警。
- 新增 `ZoneView`、`RockView`、`ZoneKind`、`ActorMove`。
- `ActorState` 新增 `pose`、`lift`、`aim`、`move`、`parentId`。`EnemyBrain` 新增 `move`、`span`、`speed`、`special`、`next`、`angle`、`side`、`flip`、`gas`、`shot`、`px`、`py`，阶段新增 `air`、`active`、`buried`、`emerge`、`spin`、`stun`。
- `CombatWorldState` 新增 `zones`、`rocks`、`rng.ai`。字段约束在 `saveFields.ts`，zod 与轻量解析器共用。`parentId` 必须小于 `nextId`，且不能等于自己的编号。
- 新事件：
  - `combat:exploded`：先发本事件，再逐个结算伤害；
  - `enemy:acted`：招式关键时刻，只给特效与音效用。
- 规则：钻在地下（`buried`、`emerge`）时，子弹、近战和爆炸都打不到；腾空和地下时没有接触伤害。
- 新数据：`BALANCE.milkSlow`、`victoryDelay`、`zoneCapacity`、`rockCapacity`；`NAVIGATION.radiusCaches` 从 4 提高到 8，覆盖新的怪物半径。

### 4. 表现层（game）

- `src/data/enemyArt.ts` 登记逐帧图集，帧名为「怪物:动作:序号」，并给出缺帧时的替补顺序。
- `src/game/entities/EnemyArt.ts` 按 `pose` 播放动画，腾空时抬高贴图，影子留在地上并缩小。ActorArt 只加了一处转发；没有逐帧图的怪物仍走旧的静态图。
- `src/game/fx/HazardLayer.ts` 负责：
  - 毒气云、奶潭；
  - 石块预警、下落与落地，落地的石块有静态碰撞体，挡人也挡子弹；
  - 舌击预警线和舌头、冲撞通道、自爆半径、眩晕星星；
  - 爆炸与落地冲击圈；
  - Boss 死亡的爆点、碎片和白闪。
- Boss 死亡演出只用负责人画的帧加特效：定住、闪白、狂抖 → 捧腹狂笑 → 压扁淡出、碎成像素。`BALANCE.victoryDelay` 让通关结算等演出播完再弹。
- 有逐帧死亡动画的怪物，等死亡帧播完才回收（`deathSeconds`）。
- Boss 房固定使用 `BOSS_ROOM_LAYOUT` 的四根石柱。
- 调试参数 `?floor=N`（AGENTS 第 11 节原有约定，之前未实现）：从第 N 层入口开局，N=4 为 Boss 层。

## 影响

- 怪物与 Boss 的数值都是初值，集中在 `src/data/enemies.ts`、`attacks.ts`、`balance.ts`，等负责人试玩后调整。
- 改到的 GPT 文件，每处都是几行转发或参数：
  - `DemoSession`：bounds、HazardLayer、通关延迟、掉落传入怪物种类；
  - `ActorArt`：转发给 EnemyArt，新怪缺静态图时借用基础怪的图；
  - `CombatFeedback`：死亡时长与血条位置；
  - `RoomArena`：Boss 房布局、换房清理；
  - `demoArt`：加载新图集；
  - `GameScene`：`?floor`。
- 旧存档：存档版本按构建区分，新构建会退回楼层入口，不会读到缺字段的现场存档。
- 补充（ADR 0031）：区域与石块存档时带上槽位下标 `slot`，读档恢复到原槽位，新生成的区域、石块占用的空槽与遍历顺序才与存档前一致。
- 回退：还原本 PR 即可。新图集是新增文件，旧的 `enemies.png` 保留不动。

## 备选方案

- **每种怪单独写一个类**：状态分散，存档和单测都更难。没选。
- **表现层自己从速度猜动作**：猜不出「蓄力的是哪一招」，预警线和动画会对不上。没选。
- **石块做成 enemy 阵营的实体**：会被算进清房数量，也会被近战和自动拾取误判。没选。
