# ADR 0035：永久天赋、结算天赋点与开局配置存档

- 状态：待负责人合并批准。
- 提出者：Claude（#98）
- 关联：ADR 0004（锁步）、ADR 0019（存档 v2）、ADR 0026（主城与续玩入口）、ADR 0030–0032（怪物、武器、机关存档字段）。
- 设计与数值：[永久天赋树与结算天赋点](../design/talent-tree.md)。

## 背景

负责人要求主城增加祭台和天赋树，每局冒险结束按表现给天赋点。这需要三份新的共享契约：天赋数据与汇总规则、局外档案及结算去重、一局冒险的开局配置如何随存档保存。目前档案（`avn.profile.v1`）只有战绩，楼层入口存档（`FloorCheckpoint` v1）不知道这局用了哪些天赋。

## 决定

### 1. 天赋数据与效果（`src/data/talents.ts`、`src/sim/meta/talents.ts`）

- 天赋表 `TALENTS`：每个节点有分支、层级、并列位置、属性、每级加成、各级价格、前置、可选的角色限定。前置只能指向同分支更低层级的节点，单测强制，所以按层级顺序检查一遍即可修正前置链。
- 效果只有 10 种：前 8 种与局内升级（`UPGRADES` 的 `stat`）相同，外加开局金币 `coins` 与出口候选数 `offers`。所有加成线性相加，不做乘法。
- `talentModifiers(ranks, kind)` 汇总加成；`CombatWorld.applyTalents(mods)` 与 `upgrade()` 共用同一段加法代码（`boost`）。生命、护甲、能量上限提高时开局补满；`coins` 加到本局金币；`offers` 由调用方用 `offerCount()` 决定出口展示几个升级。
- `applyTalents` 只在 `time = 0`、玩家存活、本局还没施加过时生效；`load()` 后视为已施加。参数有任何非法值就整体拒绝，不产生部分写入。
- 外部等级表一律经 `normalizeRanks`：丢弃未知 ID 和非整数、等级夹到上限、前置断裂的节点清零。价格上调导致透支时用 `trimRanks` 从高层级逐级退回。

### 2. 局外档案 v2（`src/sim/meta/profile.ts`，存储键 `avn.profile.v2`）

```ts
interface MetaProfile {
  version: 2;
  runs: number;
  wins: number;
  bestFloor: number;
  kills: number; // 原 v1 战绩
  earned: number; // 累计获得的天赋点
  talents: Partial<Record<TalentId, number>>;
  settled: string[]; // 最近 16 个已结算冒险 ID，新的在后
}
```

- 可用点数不存储，始终为 `earned − spentPoints(talents)`。解锁、重置、结算都返回新对象、不修改输入；调用方写盘成功后才替换内存中的档案。
- `parseProfile(stored, legacyV1)`：没有 v2 时迁移 v1（保留战绩，按「每局 2 点、每胜 6 点、最多 40 点」补发）；v2 存在时忽略 v1。v2 整体损坏（不是对象或版本不对）时报告 `corrupt`，按 v1 重建或新建；个别字段非法时逐项修复，报告 `repaired`。
- 解锁 `unlockTalent` 被拒绝时给出原因：`unknown | maxed | locked | points`。`resetTalents` 全额退回。

### 3. 结算天赋点（`settleRun`、`runReward`、`summarizeRun`）

- 只用一局的终局状态：`summarizeRun(runId, dungeonRun)` 在 `phase` 为 `won` 或 `lost` 时返回 `{ runId, victory, floor, roomsCleared, kills }`，否则返回 null。公式与分值在 `TALENT_RULES`：清房、楼层、击杀（封顶）、通关、首次到达新楼层、首次通关。
- `validSummary` 只接受 sim 可能产生的组合：合法 ID、非调试 ID、楼层在 1 到 Boss 层之间、通关必须在 Boss 层、清房数不超过「楼层数 × 每层房间上限」、计数为非负整数。
- `settleRun` 对已在 `settled` 中的 ID 返回 `duplicate`，对非法输入返回 `invalid`，两种情况都不发奖。成功时同时更新战绩，替代 `services/profile.ts` 现有的 `recordResult`。
- 冒险 ID 由 `newRunId(seed, now)` 生成（`now` 由 game 传入，sim 不读时钟），格式 `/^[0-9a-z_:-]{1,48}$/`；`debug-` 前缀的冒险不结算。

### 4. 开局配置随存档保存，以及 game 层接线约定

- `FloorCheckpoint` 升为 v2，新增 `runId` 与 `talents`（开局时冻结的天赋等级）。`parseCheckpoint` 仍接受 v1，并按零天赋、`legacy-<种子>` 冒险 ID 迁移，返回值统一为 v2。完整存档 v2 的 `entry` 字段随之携带这两项。
- 完整续玩不再施加天赋：世界状态里的属性已经包含天赋加成。入口兜底按 `entry.talents` 施加，顺序为「生成玩家 → `applyTalents` → 重放局内升级 → `restorePlayer`」。主城之后的加点只影响下一次新开冒险。
- 出口候选数由开局天赋决定：sim 存档校验只检查「基础数 ≤ 候选数 ≤ 基础数 + 满级加成」；game 层 `decodeRun` 按 `offerCount(entry.talents)` 核对精确数量，不一致就走入口兜底。
- `SAVE_VERSION.dataHash` 纳入 `TALENTS` 与 `TALENT_RULES`：天赋数据变化时，完整存档改走入口兜底，按新数据重放。
- game 层接线（GPT）：
  1. 新开冒险把档案里的 `talents` 传给 `DemoSession` 的 `start` 参数；`DemoSession` 生成冒险 ID 并冻结天赋。
  2. 冒险结束时调用 `summarizeRun(session.runId, session.dungeon)` 和 `settleRun`。**先写档案，成功后再清冒险存档**；写盘失败时提示玩家，回主城时重试一次，仍失败就放弃这次奖励，不阻塞游戏。
  3. 启动读冒险存档时，如果 `isSettled(profile, entry.runId)`，就丢弃该存档，视为已结束。这样即使「写档案」和「清存档」之间页面被关掉，也不会重复发奖或复活。
  4. 档案损坏时先把原文备份到另一个键，再覆盖。

## 取舍

- 可用点数用推导而不单独存储，避免「余额和花费对不上」这类无法解释的状态。代价是数据里改价格会改变老玩家的可用点数，所以用 `trimRanks` 从高层逐级退回兜底。
- 击杀包含召唤和分裂出的小怪。这里不新增事件字段去区分它们，而是给击杀奖励封顶，这样契约更小，也能防止拖延刷点。
- 已结算 ID 只保留 16 个：足够覆盖刷新、重复回调和中途关页；不防止玩家手动回滚浏览器存储，这在离线 PWA 中无法防止。
- 冻结开局天赋会让入口存档多出十几个字节。好处是续玩永远是开局时那套属性，不会和主城的档案互相影响。

## 验证

`tests/unit/sim/talents.test.ts`、`tests/unit/sim/metaProfile.test.ts` 覆盖：数据约束、解锁与拒绝原因、规范化与退回、满级上限、奖励公式、击杀封顶、结算去重、输入不被修改、档案迁移、修复与损坏。入口存档 v2、`applyTalents` 与候选数校验的测试在下一个 PR。
