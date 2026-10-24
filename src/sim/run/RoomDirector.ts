import { BALANCE } from '../../data/balance';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { ENCOUNTERS } from '../../data/loot';
import type { CombatWorld } from '../combat/api';
import type { Random } from '../core/Random';
import type { DungeonRun } from './DungeonRun';
import type { Rect } from './WaveDirector';

/** 与 `CombatWorldOptions.maxActors` 的默认值一致。 */
const DEFAULT_MAX_ACTORS = 31;

/**
 * 战斗之后的同一个 WORLD_STEP 执行；分别持有种类与位置随机流。
 *
 * 同时存在的实体记录（玩家、存活与等待回收的尸体）不能超过 `maxActors`，否则 `spawnEnemy` 会抛错。
 * 放不下的怪物记为待刷，等尸体回收出空位再刷；待刷的怪物计入存活数，房间不会提前清空。
 */
export class RoomDirector {
  private kinds: Random;
  private positions: Random;
  private floor: number;
  private pending = 0;
  constructor(
    private readonly world: CombatWorld,
    readonly run: DungeonRun,
    private readonly rng: Random,
    private readonly bounds: Rect,
    private readonly isFree: (x: number, y: number, radius: number) => boolean,
    private readonly maxActors = DEFAULT_MAX_ACTORS,
  ) {
    this.floor = run.floor;
    const floorRng = rng.fork(`encounters:${this.floor}`);
    this.kinds = floorRng.fork('enemy-kinds');
    this.positions = floorRng.fork('enemy-positions');
  }
  step(dt: number): void {
    if (this.floor !== this.run.floor) {
      this.floor = this.run.floor;
      const rng = this.rng.fork(`encounters:${this.floor}`);
      this.kinds = rng.fork('enemy-kinds');
      this.positions = rng.fork('enemy-positions');
      this.pending = 0;
    }
    let alive = 0;
    for (const a of this.world.actors) if (a.team === 'enemy' && a.phase !== 'dead') alive++;
    const p = this.world.playerId === null ? undefined : this.world.getActor(this.world.playerId);
    this.run.step(dt, alive + this.pending, !p || p.phase === 'dead');
    if (!p || this.run.finished) {
      this.pending = 0;
      return;
    }
    this.pending += this.run.spawnCount;
    if (!this.pending) return;
    const count = Math.min(this.pending, Math.max(0, this.maxActors - this.world.actors.length));
    for (let i = 0; i < count; i++) {
      const floor = ENCOUNTERS.floors[Math.min(this.run.floor - 1, ENCOUNTERS.floors.length - 1)]!;
      const kind: EnemyId = this.run.room.kind === 'boss' ? 'naiwa_boss' : this.kinds.pick(floor);
      const radius = ENEMIES[kind].radius,
        b = this.bounds;
      let bx = b.x + radius,
        by = b.y + radius,
        best = -1;
      for (let attempt = 0; attempt < ENCOUNTERS.attempts; attempt++) {
        const x = this.positions.range(b.x + radius, b.x + b.width - radius);
        const y = this.positions.range(b.y + radius, b.y + b.height - radius);
        if (!this.isFree(x, y, radius)) continue;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d > best) {
          best = d;
          bx = x;
          by = y;
        }
        if (d >= BALANCE.spawnMinDistance) break;
      }
      // 地图适配层保留角落安全出生区域，有限重试失败时使用固定角落。
      this.world.spawnEnemy(kind, bx, by);
    }
    this.pending -= count;
    this.run.alive = alive + count + this.pending;
  }
}
