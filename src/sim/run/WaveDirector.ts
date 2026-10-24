import { BALANCE } from '../../data/balance';
import { ENEMIES, type EnemyId } from '../../data/enemies';
import type { CombatWorld } from '../combat/api';
import type { Random } from '../core/Random';

/** 轴对齐矩形，世界坐标，像素。 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WaveDirectorOptions {
  /** 本局的战斗世界；导演只调用 `spawnEnemy`，并读取 `actors` 统计存活数。 */
  world: CombatWorld;
  /** 刷怪用的随机流，调用方传入 `runRng.fork('waves')`，不与战斗随机流共用。 */
  rng: Random;
  /** 可以刷怪的区域（房间内边界）。怪物整个碰撞圆都在区域内。 */
  bounds: Rect;
  /** 刷哪种怪。M1 只有一种。 */
  kind: EnemyId;
}

/** 找刷怪点时最多尝试的次数；全部失败时取尝试过的离玩家最远的点。 */
const SPAWN_ATTEMPTS = 24;

/**
 * M1 灰盒房间的刷怪导演：上一波清空后等待 `BALANCE.waveInterval` 秒，
 * 按 `BALANCE.waveSizes` 循环刷下一波；开局也先等待一次间隔。玩家死亡后不再刷怪。
 *
 * 由战斗场景在每个物理步、`CombatWorld.step` 之后调用 `step`，与战斗共用同一个时钟，
 * 所以同一种子下的刷怪时间与位置和帧率无关。
 */
export class WaveDirector {
  /** 已经开始的波数，第一波开始后为 1。 */
  wave = 0;
  /** 当前存活（含预警中）的怪物数，每次 `step` 更新。 */
  alive = 0;
  private wait: number = BALANCE.waveInterval;
  private readonly radius: number;

  constructor(private readonly options: WaveDirectorOptions) {
    this.radius = ENEMIES[options.kind].radius;
  }

  /** 推进 `dt` 秒。可能在本次调用中刷出一整波怪。 */
  step(dt: number): void {
    const { world } = this.options;
    this.alive = 0;
    for (const actor of world.actors) if (actor.team === 'enemy' && actor.phase !== 'dead') this.alive++;

    const player = world.playerId === null ? undefined : world.getActor(world.playerId);
    if (!player || player.phase === 'dead' || this.alive > 0) return;

    this.wait -= dt;
    if (this.wait > 0) return;
    const sizes = BALANCE.waveSizes;
    const count = sizes[this.wave % sizes.length] ?? 1;
    for (let i = 0; i < count; i++) this.spawnOne(player.x, player.y);
    this.wave++;
    this.alive = count;
    this.wait = BALANCE.waveInterval;
  }

  /** 在区域内随机取点：离玩家至少 `spawnMinDistance`，离本局其他怪至少 `enemySeparation`。 */
  private spawnOne(px: number, py: number): void {
    const { world, rng, bounds, kind } = this.options;
    const margin = this.radius;
    const minX = bounds.x + margin,
      maxX = bounds.x + bounds.width - margin,
      minY = bounds.y + margin,
      maxY = bounds.y + bounds.height - margin;
    let bestX = minX,
      bestY = minY,
      bestDistance = -1;
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const x = rng.range(minX, maxX),
        y = rng.range(minY, maxY);
      const distance = Math.hypot(x - px, y - py);
      if (distance >= BALANCE.spawnMinDistance && this.clearOfEnemies(x, y)) {
        world.spawnEnemy(kind, x, y);
        return;
      }
      if (distance > bestDistance) {
        bestX = x;
        bestY = y;
        bestDistance = distance;
      }
    }
    world.spawnEnemy(kind, bestX, bestY);
  }

  private clearOfEnemies(x: number, y: number): boolean {
    for (const actor of this.options.world.actors) {
      if (actor.team !== 'enemy' || actor.phase === 'dead') continue;
      if (Math.hypot(actor.x - x, actor.y - y) < BALANCE.enemySeparation) return false;
    }
    return true;
  }
}
