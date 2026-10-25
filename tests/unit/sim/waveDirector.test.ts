import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/data/balance';
import { ENEMIES } from '../../../src/data/enemies';
import type { ActorPhase, ActorView, CombatWorld } from '../../../src/sim/combat/api';
import { Random } from '../../../src/sim/core/Random';
import { WaveDirector, type Rect } from '../../../src/sim/run/WaveDirector';

type Actor = { -readonly [K in keyof ActorView]: ActorView[K] };

const ACTOR_DEFAULTS = {
  vx: 0,
  vy: 0,
  radius: 6,
  hp: 1,
  maxHp: 1,
  invulnerable: false,
  facing: 0,
  pose: 'idle' as const,
  lift: 0,
  aim: 0,
  move: 'none' as const,
  chill: 0,
  frozen: false,
};

/** 只实现导演用到的部分：生成、查询、阶段。 */
function fakeWorld() {
  const actors: Actor[] = [];
  let nextId = 1;
  const make = (team: Actor['team'], kind: string, x: number, y: number, phase: ActorPhase): number => {
    const id = nextId++;
    actors.push({ ...ACTOR_DEFAULTS, id, team, kind, phase, x, y });
    return id;
  };
  const world = {
    time: 0,
    actors,
    playerId: null as number | null,
    getActor: (id: number) => actors.find((a) => a.id === id),
    spawnEnemy: (kind: string, x: number, y: number) => make('enemy', kind, x, y, 'telegraph'),
  };
  world.playerId = make('player', 'ai_proto', 240, 135, 'active');
  return { world: world as unknown as CombatWorld, actors };
}

const BOUNDS: Rect = { x: 104, y: 47, width: 272, height: 176 };
const DT = 1 / 60;

function setup(seed = 7) {
  const { world, actors } = fakeWorld();
  const director = new WaveDirector({
    world,
    rng: new Random(seed).fork('waves'),
    bounds: BOUNDS,
    kind: 'naiwa_chaser',
  });
  const enemies = () => actors.filter((a) => a.team === 'enemy');
  const killAll = () => {
    for (const a of enemies()) a.phase = 'dead';
  };
  /** 推进到下一波刷出，返回所用的秒数。 */
  const untilWave = (dt = DT) => {
    const start = director.wave;
    let t = 0;
    while (director.wave === start && t < 10) {
      director.step(dt);
      t += dt;
    }
    return t;
  };
  return { director, actors, enemies, killAll, untilWave };
}

describe('WaveDirector', () => {
  it('开局等待一个间隔后刷第一波，数量取 waveSizes[0]', () => {
    const { director, enemies, untilWave } = setup();
    director.step(DT);
    expect(enemies()).toHaveLength(0);
    expect(Math.abs(untilWave() + DT - BALANCE.waveInterval)).toBeLessThan(DT * 1.5);
    expect(enemies()).toHaveLength(BALANCE.waveSizes[0]!);
    expect(director.wave).toBe(1);
    expect(director.alive).toBe(BALANCE.waveSizes[0]);
  });

  it('刷怪点在区域内（整个碰撞圆）、离玩家足够远、怪物之间不重叠', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { enemies, killAll, untilWave } = setup(seed);
      for (let w = 0; w < BALANCE.waveSizes.length; w++) {
        untilWave();
        const list = enemies().filter((a) => a.phase !== 'dead');
        const r = ENEMIES.naiwa_chaser.radius;
        for (const a of list) {
          expect(a.x - r).toBeGreaterThanOrEqual(BOUNDS.x);
          expect(a.x + r).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width);
          expect(a.y - r).toBeGreaterThanOrEqual(BOUNDS.y);
          expect(a.y + r).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height);
          expect(Math.hypot(a.x - 240, a.y - 135)).toBeGreaterThanOrEqual(BALANCE.spawnMinDistance);
          for (const b of list) {
            if (b === a) continue;
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(BALANCE.enemySeparation);
          }
        }
        killAll();
      }
    }
  });

  it('还有怪活着（含预警中）时不刷下一波；清空后再等一个间隔', () => {
    const { director, enemies, killAll, untilWave } = setup();
    untilWave();
    for (let i = 0; i < 600; i++) director.step(DT);
    expect(director.wave).toBe(1);
    killAll();
    const t = untilWave();
    expect(Math.abs(t - BALANCE.waveInterval)).toBeLessThan(DT * 1.5);
    expect(enemies().filter((a) => a.phase !== 'dead')).toHaveLength(BALANCE.waveSizes[1]!);
  });

  it('波次数量按 waveSizes 循环', () => {
    const { director, enemies, killAll, untilWave } = setup();
    const counts: number[] = [];
    for (let w = 0; w < BALANCE.waveSizes.length * 2; w++) {
      untilWave();
      counts.push(enemies().filter((a) => a.phase !== 'dead').length);
      killAll();
    }
    expect(counts).toEqual([...BALANCE.waveSizes, ...BALANCE.waveSizes]);
    expect(director.wave).toBe(BALANCE.waveSizes.length * 2);
  });

  it('玩家死亡后不再刷怪', () => {
    const { director, actors, killAll, untilWave } = setup();
    untilWave();
    killAll();
    actors[0]!.phase = 'dead';
    for (let i = 0; i < 600; i++) director.step(DT);
    expect(director.wave).toBe(1);
  });

  it('同一种子刷怪位置相同，且与物理步长无关', () => {
    const run = (dt: number, seed = 99) => {
      const { enemies, killAll, untilWave } = setup(seed);
      const points: number[] = [];
      for (let w = 0; w < 3; w++) {
        untilWave(dt);
        for (const a of enemies().filter((e) => e.phase !== 'dead')) points.push(a.x, a.y);
        killAll();
      }
      return points;
    };
    expect(run(1 / 60)).toEqual(run(1 / 60));
    expect(run(1 / 120)).toEqual(run(1 / 60));
    expect(run(1 / 60, 100)).not.toEqual(run(1 / 60));
  });
});
