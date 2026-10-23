# 0002. M1 共享契约：InputFrame、战斗事件、数据格式

- 状态：提议
- 提出者：Claude
- 批准：负责人（待批准）
- 关联：Issue #10

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

新增 `entity:spawned`、`entity:damaged`、`entity:died`、`weapon:fired`、`bullet:hit`。

- 参数带世界坐标与方向，特效、音效、HUD 只靠事件就能工作，不需要读战斗内部状态。
- 无敌帧内的命中不发 `entity:damaged`。
- 监听器不能在回调之外保存 payload 引用（以后可能复用 payload 对象来避免分配）。
- 战斗结算不依赖监听器的执行顺序；事件只用于通知。

### 3. 数据格式（`src/data/schema/`）与初始数据（`src/data/`）

- 角色 `CharacterDef`、武器 `WeaponDef`、怪物 `EnemyDef`、全局参数 `BalanceDef`，均用 zod 的 `strictObject` 定义：拼错字段名会被测试直接拦下，不会被静默忽略。
- **zod 只在测试与校验脚本中运行。** 数据文件用 `import type` 取得类型，再用 `as const satisfies` 检查；运行时代码禁止 import zod（ESLint 拦截），所以 zod 不会进入生产包。
- 武器在 `docs/DATA_SCHEMA.md` 原有字段的基础上，新增 `bulletRadius`（子弹碰撞半径）、`pierce`（穿透数）、`knockback`（击退距离）。
- 弹道模式与怪物行为先列出完整的枚举，M1 只实现 `single` 与 `chase`，其余在 M3 加入注册表。
- 全局参数只放影响战斗结果的数值；纯视觉参数（闪白、震屏等）由画面方案（#11）另行定义。

初始数据：原型 AI 娘 `ai_proto`（生命 6、移速 90）、手枪 `pistol_basic`（伤害 3、每秒 4 发）、追击怪 `naiwa_chaser`（生命 9、移速 45）。数值是起点，负责人试玩后调整。

## 影响

- #12 产出 `InputFrame`，#13 消费 `InputFrame` 并发出事件，#14 与 #16 订阅事件。
- 修改这些类型或 schema 字段都属于共享契约变更，需要新的 ADR。
- 新增数据条目（比如再加一把武器）只改数据文件，不需要 ADR。

## 备选方案

- **用 Phaser 的事件系统代替自建 EventBus**：会让 `sim/` 依赖 Phaser，违反分层规则。
- **运行时也用 zod 校验数据**：会给生产包增加几十 KB，而数据是编译期常量，用测试校验已经足够。
