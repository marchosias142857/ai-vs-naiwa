# 数据格式约定

所有玩法数值放 `src/data/`，格式由 `src/data/schema/` 中的 zod schema 定义（ADR 0002）。**schema 文件是字段含义的唯一来源**，每个字段都有注释；本文只写通用规则。

## 通用规则

- 每类一个文件：`characters.ts`、`weapons.ts`、`enemies.ts`、`balance.ts`（已有），以及之后的 `bosses.ts`、`buffs.ts`、`loot.ts`、`biomes.ts`。
- 写成 `export const WEAPONS = { ... } as const satisfies Record<string, WeaponDef>;`，ID 就是对象的 key。
- 类型用 `import type { WeaponDef } from './schema'` 取得。**运行时代码不能对 zod 或 schema 做值导入**（ESLint 与 `tests/unit/architecture.test.ts` 拦截），zod 只在测试与校验脚本中运行。
- schema 用 `strictObject`：多写、拼错的字段会被测试拦下。
- ID 用 `snake_case`，全局唯一，一旦上线不改名（存档会引用）。
- 名称、描述写 i18n key（如 `weapon.pistol_basic`），不直接写中文。
- 引用其他数据用 ID 字符串（如角色的 `startWeapon`）；引用是否存在、纹理 key 是否存在，由 `tests/unit/data.test.ts` 检查。
- 单位：时间用秒；距离用像素；速度用像素/秒；角度在数据里用度、在代码里用弧度；概率用 0–1。
- 影响战斗结果的全局参数放 `balance.ts`；纯视觉参数（闪白时长、震屏强度等）按画面方案另放，见 `docs/visual/`。

## 现有数据

| 文件            | 内容                                                                             | schema                |
| --------------- | -------------------------------------------------------------------------------- | --------------------- |
| `characters.ts` | 原型 AI 娘 `ai_proto`                                                            | `schema/character.ts` |
| `weapons.ts`    | 手枪 `pistol_basic`                                                              | `schema/weapon.ts`    |
| `enemies.ts`    | 追击怪 `naiwa_chaser`                                                            | `schema/enemy.ts`     |
| `balance.ts`    | 刷怪预警、死亡后重来的延迟、怪物间距、自动瞄准切换间隔、波次、刷怪距离、击退时长 | `schema/balance.ts`   |

## 什么时候需要 ADR

- 新增或修改 schema 字段、枚举值：需要 ADR（共享契约变更）。
- 只新增数据条目或调整数值：不需要 ADR；数值调整由负责人拍板。

字段的玩法含义见 `docs/GDD.md`。
