# 0003. M1 战斗 sim 接口：CombatWorld

- 状态：提议
- 提出者：Claude
- 批准：负责人（待批准）
- 关联：Issue #13（实现）、#14（对接）、#15（场景接线）

## 背景

#14（实体与对象池）要和 #13（sim 战斗核心）并行开发，需要先约定 game 层如何调用 sim。本 ADR 只定接口，实现在 #13 的后续 PR 中完成。

## 决定

接口定义在 `src/sim/combat/api.ts`，入口是 `createCombatWorld(options)`，返回 `CombatWorld`。

### 1. 分工

| 事情                         | 负责                    |
| ---------------------------- | ----------------------- |
| 期望速度（含加减速、击退）   | sim                     |
| 开火时机、散布、生成哪些子弹 | sim                     |
| 伤害、暴击、无敌帧、死亡     | sim                     |
| 出场预警计时与激活           | sim                     |
| 自动瞄准选目标               | sim（视线由 game 提供） |
| 按速度移动、挡墙             | Phaser Arcade           |
| 检测重叠（子弹、接触）       | Phaser Arcade           |
| 子弹对象、寿命到期回收       | game（对象池）          |

位置以物理结果为准：game 每帧把物理体位置写回 sim，sim 据此计算下一帧。

### 2. 每帧顺序

在战斗场景的 `update` 中（Arcade 已在此之前完成本帧的移动与重叠检测）：

1. 输入层产出本帧的 `InputFrame`。
2. 对每个活着的实体调用 `syncPosition(id, x, y)`。
3. 调用 `step(dt, input)`，得到 `StepResult`。
4. 按每个实体的 `vx / vy` 设置物理体速度；按 `bulletSpawns` 从子弹池取子弹。

重叠回调 `hitActor`、`hitWall`、`contact` 在物理步进期间随时调用，sim 立即结算并发出 ADR 0002 的事件。

### 3. 编号

实体与子弹的编号都由 sim 分配，在本局内唯一。这取代了 ADR 0002 中「由 game 层分配」的说法，`EntityId` 的注释已同步修改。原因是事件由 sim 发出，编号也由 sim 分配，game 层就不需要先申请编号再通知 sim。

### 4. 生命周期

- **玩家**：`spawnPlayer` 时同一帧发出 `entity:spawned`（`telegraph` 为 0）与 `entity:activated`。
- **怪物**：`spawnEnemy` 后进入预警；预警结束时由 `step` 发出 `entity:activated`。
- **死亡**：sim 把实体标记为 `dead` 并发出 `entity:died`；game 播完死亡表现、回收对象后调用 `removeActor`。
- **子弹**：`hitActor` 返回 true 或调用 `hitWall` 时，子弹由 sim 结束；寿命到期时 game 调用 `releaseBullet`。三者之后，这个子弹编号都不再使用。
- **重来**：新建一个 `CombatWorld`，不复用旧对象。

### 5. 不分配内存

`ActorView`、`BulletSpawn`、`StepResult` 以及 `actors`、`bulletSpawns` 数组都由 sim 持有并复用。game 只在当帧读取，不修改、不跨帧保存，约定与 `InputFrame` 相同。

### 6. 其他

- `step` 的 `dt` 内部截断到 0.05 秒，避免卡顿后一帧走得太远（例如穿墙）。
- 新增全局参数 `BALANCE.knockbackTime`（0.08 秒）：武器的击退距离在这段时间内线性减速走完。修改了 `src/data/schema/balance.ts`，属于共享契约变更，由本 ADR 一并批准。

## 影响

- #14 可以按 `api.ts` 写对接代码，并用实现了 `CombatWorld` 接口的假对象做测试，不必等 #13 实现。
- `createCombatWorld` 在实现 PR 合并前会抛出错误；当前没有任何运行时代码调用它，main 的行为不变。
- 修改 `api.ts` 中的接口需要新的 ADR。

## 备选方案

- **sim 自己积分位置、只把 Arcade 当碰撞检测**：挡墙要在 sim 里再实现一遍，和 Arcade 的结果容易不一致。
- **子弹也全部由 sim 持有和移动**：400 发子弹每帧在 sim 与物理体之间同步位置，开销更大；子弹的飞行本身不需要规则判断。
