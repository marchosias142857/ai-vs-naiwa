# 0002. M1 共享契约：InputFrame、战斗事件、数据格式

- 状态：提议
- 提出者：Claude
- 批准：负责人（待批准）
- 关联：Issue #10；修订：按 GPT 评审补充暴击字段、实体阶段与 zod 边界检查

## 背景

M1 的输入层（#12）、sim 战斗核心（#13）、实体与对象池（#14）要并行开发，需要先约定三方共用的类型和数据格式。

## 决定

### 1. 输入：`InputFrame`（`src/sim/core/types.ts`）

| 字段              | 类型            | 含义                                                      |
| ----------------- | --------------- | --------------------------------------------------------- |
| `move`            | `Vec2`          | 长度 0–1，已处理死区与斜向归一化                          |
| `aim`             | `Vec2` / `null` | 单位向量；`null` 表示交给自动瞄准                         |
| `fire`            | `boolean`       | 开火键是否按住（持续）                                    |
| `skillPressed` 等 | `boolean`       | 技能 / 切枪 / 交互 / 暂停：本帧刚按下，每次按下只为真一帧 |
| `source`          | `InputSource`   | `keyboard` / `touch` / `gamepad`                          |

- 生成方每帧复用同一个对象（`createInputFrame` 初始化、`resetInputFrame` 清空），消费方不能跨帧保存引用。
- 触屏默认 `aim = null`，即「按住射击键就对自动瞄准的目标开火」，与元气骑士一致。

### 2. 战斗事件（`src/sim/core/events.ts`）

新增 `entity:spawned`、`entity:activated`、`entity:damaged`、`entity:died`、`weapon:fired`、`bullet:hit`。

- 参数带世界坐标与方向，特效、音效、HUD 只靠事件就能工作，不需要读战斗内部状态。半径、生命上限、无敌时长等按 `kind` 从只读数据查。
- 监听器不能在回调之外保存 payload 引用（以后可能复用 payload 对象来避免分配）。
- 战斗结算不依赖监听器的执行顺序；事件只用于通知。

**实体的三个阶段**，计时与切换全部由 sim（#13）负责，game 层（#14、#16）只按事件响应：

| 阶段 | 开始事件           | 碰撞 | 行动 | 表现层（#14、#16）                         |
| ---- | ------------------ | ---- | ---- | ------------------------------------------ |
| 预警 | `entity:spawned`   | 无   | 不能 | 显示地面预警圈，持续 `telegraph` 秒        |
| 活动 | `entity:activated` | 有   | 能   | 移除预警圈，实体出现（弹出动画），开启碰撞 |
| 死亡 | `entity:died`      | 无   | 不能 | 死亡特效，回收对象                         |

`telegraph` 为 0（比如玩家开局）时，同一帧内依次发出 `entity:spawned` 与 `entity:activated`。

**暴击与命中**：

- 暴击由 sim 判定，`entity:damaged.critical` 与 `bullet:hit.critical` 给出结果，表现层不要从伤害数值推断。
- 同一次子弹命中，事件按固定顺序发出：`entity:damaged` →（致命时）`entity:died` → `bullet:hit`。
- **命中火花只由 `bullet:hit` 产生**：`critical` 为 true 时用暴击火花代替普通火花，不叠加两份。暴击的震屏由 `entity:damaged.critical` 触发。
- 无敌帧内被子弹打中：子弹照常消失并发出 `bullet:hit`（`critical` 为 false），但不发出 `entity:damaged`。
- 接触伤害（怪物碰到玩家）只发 `entity:damaged`，没有 `bullet:hit`。

### 3. 数据格式（`src/data/schema/`）与初始数据（`src/data/`）

- 角色 `CharacterDef`、武器 `WeaponDef`、怪物 `EnemyDef`、全局参数 `BalanceDef`，均用 zod 的 `strictObject` 定义：拼错字段名会被测试直接拦下，不会被静默忽略。
- **zod 只在测试与校验脚本中运行。** 数据文件用 `import type` 取得类型，再用 `as const satisfies` 检查，所以 zod 不会进入生产包。两层拦截：
  - ESLint：`src/`（除 `src/data/schema/`）中对 `zod` 与 `zod/*` 的值导入报错，type-only 导入允许。
  - `tests/unit/architecture.test.ts`：用 TypeScript 语法树列出 `src/` 每个文件的 import、re-export、动态 `import()`，把相对路径解析成真实位置后检查。它拦截对 `zod` 与 `zod/*`、以及对 `src/data/schema` 的值导入（含 `./schema`、`../../data/schema/weapon` 等写法），同时复查 sim / data 不依赖 Phaser 与表现层。检查器本身有 21 条回归用例。
- 武器在 `docs/DATA_SCHEMA.md` 原有字段的基础上，新增 `bulletRadius`（子弹碰撞半径）、`pierce`（穿透数）、`knockback`（击退距离）。
- 弹道模式与怪物行为先列出完整的枚举，M1 只实现 `single` 与 `chase`，其余在 M3 加入注册表。
- 全局参数只放影响战斗结果的数值；纯视觉参数（闪白、震屏等）由画面方案（#11）另行定义。

初始数据：原型 AI 娘 `ai_proto`（生命 6、移速 90）、手枪 `pistol_basic`（伤害 3、每秒 4 发）、追击怪 `naiwa_chaser`（生命 9、移速 45）。数值是起点，负责人试玩后调整。

### 4. 绘制层级（`src/config.ts` 的 `DEPTH`）

按画面方案（#11，`docs/visual/m1-feel.md`）定义从地面到触屏控件的 11 个层级；角色与怪物在 `DEPTH.actors` 内按脚底 y 坐标排序。敌方子弹（41）永远在玩家子弹（40）之上。

## 影响

- #12 产出 `InputFrame`，#13 消费 `InputFrame` 并发出事件，#14 与 #16 订阅事件。
- 修改这些类型或 schema 字段都属于共享契约变更，需要新的 ADR。
- 新增数据条目（比如再加一把武器）只改数据文件，不需要 ADR。

## 备选方案

- **用 Phaser 的事件系统代替自建 EventBus**：会让 `sim/` 依赖 Phaser，违反分层规则。
- **运行时也用 zod 校验数据**：会给生产包增加几十 KB，而数据是编译期常量，用测试校验已经足够。
