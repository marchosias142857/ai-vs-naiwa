import type { UpgradeId } from '../../data/player';
import type { CombatWorld, CombatWorldState } from '../combat/api';
import type { Random } from '../core/Random';
import type { LootSystem, LootSystemState } from '../loot/LootSystem';
import type { DungeonRun, DungeonRunState } from './DungeonRun';
import type { RoomDirector, RoomDirectorState } from './RoomDirector';

/** 升级相关的本局状态。容器由 game 持有（DemoSession），规则数据由 sim 定义。 */
export interface RunRewards {
  /** 本层的升级候选随机流（`upgrades:${floor}`）。 */
  rng: Random;
  /** 本局已选的升级，按选择顺序。 */
  upgrades: UpgradeId[];
  /** 出口三选一时的候选；不在选择中时为空。 */
  offers: UpgradeId[];
}

/** 存档 v2 的 `sim` 部分（ADR 0019 第 1 节）。纯 JSON 数据，不含引用。 */
export interface SimSnapshot {
  world: CombatWorldState;
  run: DungeonRunState;
  director: RoomDirectorState;
  loot: LootSystemState;
  rewards: { rng: number; upgrades: UpgradeId[]; offers: UpgradeId[] };
}

/** 一局里需要存档的 sim 对象。 */
export interface SimParts {
  world: CombatWorld;
  run: DungeonRun;
  director: RoomDirector;
  loot: LootSystem;
  rewards: RunRewards;
}

/** 取齐 sim 部分的快照。只在完整更新的边界调用，不在 WORLD_STEP 监听链中途调用（ADR 0019 第 2 节）。 */
export function saveSim(parts: Readonly<SimParts>): SimSnapshot {
  const r = parts.rewards;
  return {
    world: parts.world.save(),
    run: parts.run.save(),
    director: parts.director.save(),
    loot: parts.loot.save(),
    rewards: { rng: r.rng.snapshot, upgrades: [...r.upgrades], offers: [...r.offers] },
  };
}

/**
 * 把快照写入一套新建的 sim 对象（ADR 0019 第 3 节），不发任何事件。
 *
 * 调用方先用 `DungeonRun.restore(seed, bus, snapshot.run)` 重建 `run`，再用它创建 RoomDirector；
 * `world` 必须刚创建、还没有生成玩家；`rewards.rng` 须是 `upgrades:${snapshot.run.floor}` 子流。
 */
export function loadSim(parts: Readonly<SimParts>, snapshot: Readonly<SimSnapshot>): void {
  parts.world.load(snapshot.world);
  parts.director.load(snapshot.director);
  parts.loot.load(snapshot.loot);
  const r = parts.rewards;
  r.rng.restore(snapshot.rewards.rng);
  r.upgrades.length = r.offers.length = 0;
  r.upgrades.push(...snapshot.rewards.upgrades);
  r.offers.push(...snapshot.rewards.offers);
}
