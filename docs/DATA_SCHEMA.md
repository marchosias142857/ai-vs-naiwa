# 数据格式约定

玩法数值放 `src/data/`，由 `src/data/schema/` 的 zod schema 定义。本文记录当前 demo 的字段类别和约束；字段类型以 schema 为准。

## 通用规则

- `as const satisfies` 检查数据；通过 type-only 导入获取类型。运行时禁止对 zod / schema 值导入，校验在测试和脚本执行。
- 数据配置使用 strictObject；检查点是外部输入，轻量 parseCheckpoint 与 schema 成对测试。
- ID 使用 snake_case；名称使用 i18n key。引用 ID/纹理存在性由数据单测检查。
- 秒、像素、像素/秒；数据角度为度，规则角度为弧度；概率 0–1。
- 玩法参数与视觉参数分离。视觉放 game/fx/params.ts，正式方案见 docs/visual。
- schema/API 变更必须 ADR；数据数值由负责人拍板。

## 当前数据与 schema

| 数据文件                | schema                           | 关键内容                                                                           |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| `characters.ts`         | `character.ts`                   | ai_proto、生命/移速/半径、startWeapon                                              |
| `weapons.ts`            | `weapon.ts`                      | 10 把武器，伤害/暴击/射速/能耗/弹速/寿命/半径/散布/弹丸数/穿透/击退                |
| `attacks.ts`            | 复用 `weapon.ts`                 | 敌方攻击；single/spread/burst/twin/radial 弹道及 burstInterval                     |
| `enemies.ts`            | `enemy.ts`                       | 6 普通怪和 Boss；attack、desiredRange、dash、phases 等可选字段                     |
| `balance.ts`            | `balance.ts`                     | 预警、无敌/击退时长、自动瞄准、间距、死亡延迟等                                    |
| `dungeon.ts`            | `dungeon.ts`                     | 网格大小、主路径/支线房数、普通层数                                                |
| `rooms.ts`              | `rooms.ts`                       | 波次数量、间隔、楼层增量、门口/出口判定距离                                        |
| `layouts.ts`            | `layouts.ts`                     | 相对房间中心的矩形墙体模板、最多 8 墙                                              |
| `player.ts`             | `player.ts` 的 PlayerRulesSchema | 护甲/能量、护甲恢复、技能冷却/冲刺时间和速度                                       |
| `player.ts` 的 UPGRADES | `player.ts` 的 UpgradeDefSchema  | 8 种升级，stat/amount/name，display=number 或 percent                              |
| `loot.ts` 的 LOOT_RULES | `loot.ts` 的 LootRulesSchema     | 固定容量、武器预留槽、noDropChance、权重、拾取半径、奖励、补给价格、upgradeChoices |
| `loot.ts` 的 ENCOUNTERS | `loot.ts` 的 EncountersSchema    | 每层敌人种类池、出生尝试次数                                                       |
| `navigation.ts`         | `navigation.ts`                  | cellSize、clearance、lookahead、tieEpsilon、radiusCaches                           |
| 外部楼层检查点          | `checkpoint.ts`                  | version/seed/floor、upgrades、secondary/equipped、资源与成绩                       |

以上新增了 DungeonDef、RoomRules、RoomLayouts、PlayerRules、UpgradeDef、LootRules、EncounterRules、NavigationRules、FloorCheckpoint 九类 schema；攻击继续复用武器格式。

## 武器和掉落的约束

- 开局只有 pistol_basic。CombatWorld.secondaryWeapon 为 WeaponId | null，只有一把时切换无效；weaponId 为 WeaponId。
- takeWeapon 是装备操作，地面拾取必须走 LootSystem 原槽交换，以保留旧第二把；手枪永远保留第一槽。
- `noDropChance: 0.4` 表示 40% 击杀不掉落，余下 60% 才按 drops 权重抽取；清房奖励不受此概率影响。
- `capacity: 64`、`weaponReserve: 1`：普通物资只能占用非预留槽，武器允许使用所有空槽。已经在地面的武器互换不申请额外槽位。
- 武器槽记录 room，跨房保留到本层结束。仅当前房间的槽可见/可拾取。换层清空全部槽，表现对象继续复用。
- `upgradeChoices` 为 1–8，HUD 按数据创建相同数量的按钮；升级显示格式取自 display。
- `radiusCaches: 4` 预热四组导航 blocked/距离数组，超出种类轮换，容量不会随时间增长。

## v1 检查点边界

`secondary` 允许 null 或已知 WeaponId；equipped 必须是 pistol_basic 或非空 secondary。没有 secondary 字段、未知 ID、非法数字/楼层/升级数量均拒绝。旧字符串格式继续可读；旧 secondary=pistol_basic 在解析时归一为空。

版本和 localStorage key 不变。升级/掉落/刷怪在同一楼层入口按 seed + floor 重新派生，得到相同子流；房内状态及战斗随机流不在本格式内。完整状态存档 v2 等独立 ADR，不能把 v1 描述成退出现场恢复。

## 契约记录

基础约定见 ADR 0002；demo 扩展见 ADR 0006–0017；集中评审后的空槽/掉落/缓存字段见 ADR 0018。新增字段或枚举需要 ADR，单纯新增数据条目不需要。

## 武器品质展示（主城入口迭代）

武器已有必填字段 `rarity`：`white | green | blue | purple | orange | red`。对应白、绿、蓝、紫、橙、红品质。品质作为武器内置元数据，在装备栏和拾取提示展示，不影响伤害、能耗和掉落概率；当前十二件武器覆盖白到橙，红色留作扩展。

| 品质 | 当前武器 ID                                |
| ---- | ------------------------------------------ |
| 白   | pistol_basic                               |
| 绿   | rifle_auto、shotgun_fan、cutlass           |
| 蓝   | twin_smg、burst_rifle、wide_staff          |
| 紫   | sniper_pierce、needle_rifle、anchor_hammer |
| 橙   | ring_staff、heavy_cannon                   |
| 红   | 暂无                                       |
