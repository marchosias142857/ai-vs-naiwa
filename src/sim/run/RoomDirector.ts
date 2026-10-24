import { BALANCE } from '../../data/balance';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import { ENCOUNTERS } from '../../data/loot';
import type { CombatWorld } from '../combat/api';
import type { Random } from '../core/Random';
import type { DungeonRun } from './DungeonRun';
import type { Rect } from './WaveDirector';

/** 战斗之后的同一个 WORLD_STEP 执行；分别持有种类与位置随机流。 */
export class RoomDirector {
  private readonly kinds: Random;
  private readonly positions: Random;
  constructor(
    private readonly world: CombatWorld,
    readonly run: DungeonRun,
    rng: Random,
    private readonly bounds: Rect,
    private readonly isFree: (x: number, y: number, radius: number) => boolean,
  ) {
    this.kinds = rng.fork('enemy-kinds');
    this.positions = rng.fork('enemy-positions');
  }
  step(dt: number): void {
    let alive = 0;
    for (const a of this.world.actors) if (a.team === 'enemy' && a.phase !== 'dead') alive++;
    const p = this.world.playerId === null ? undefined : this.world.getActor(this.world.playerId);
    this.run.step(dt, alive, !p || p.phase === 'dead');
    if (!p || !this.run.spawnCount) return;
    for (let i = 0; i < this.run.spawnCount; i++) {
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
    this.run.alive = this.run.spawnCount;
  }
}
