# 数据格式约定

所有玩法数值放 `src/data/`。M3 起每类数据配一个 zod schema（`src/data/schema/`），开发期加载时校验，CI 用 `scripts/validate-data.ts` 校验全部数据。

## 通用规则

- 每类一个文件：`characters.ts`、`weapons.ts`、`enemies.ts`、`bosses.ts`、`buffs.ts`、`loot.ts`、`biomes.ts`、`balance.ts`。
- 写成 `export const WEAPONS = { ... } as const satisfies Record<string, WeaponDef>;`，ID 就是对象的 key。
- ID 用 `snake_case`，全局唯一，一旦上线不改名（存档会引用）。
- 名称、描述写 i18n key（如 `weapon.pistol_basic`），不直接写中文。
- 引用其他数据用 ID 字符串（如掉落表引用武器 ID），由校验脚本检查引用存在。
- 时间单位：秒；距离：像素；速度：像素/秒；角度：度（数据里）/弧度（代码里）；概率：0–1。
- 手感参数（加速度、击退距离、震屏强度、顿帧时长）放 `balance.ts`，方便负责人调。

## 示例：武器（M3 定稿，修改需 ADR）

```ts
pistol_basic: {
  name: 'weapon.pistol_basic', rarity: 'white', type: 'pistol',
  damage: 3, fireRate: 4, energyCost: 0, spread: 4,
  pellets: 1, bulletSpeed: 260, range: 220, critChance: 0.05,
  pattern: 'single', bulletSprite: 'bullet_small_yellow',
},
```

字段含义见 `docs/GDD.md`「武器」。
