import { describe, expect, it } from 'vitest';
import { PLAYER_RULES, UPGRADES, type UpgradeId } from '../../../src/data/player';
import type { WeaponId } from '../../../src/data/weapons';
import { createCombatWorld, type CombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { Random } from '../../../src/sim/core/Random';
import { createInputFrame, type InputFrame } from '../../../src/sim/core/types';
import { LootSystem } from '../../../src/sim/loot/LootSystem';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { RoomDirector } from '../../../src/sim/run/RoomDirector';
import { loadSim, saveSim, type SimSnapshot } from '../../../src/sim/run/snapshot';

/**
 * ADR 0019 第 5 节：存档 → JSON → 读入全新对象后，与不中断的那一局面对同样的物理步输入，结果必须逐项相同。
 *
 * 这里用一个最小的「game」代替 Phaser：按速度积分位置、子弹按槽位顺序与实体按数组顺序做圆形重叠、
 * 寿命到期回收、尸体 0.2 秒后回收。它自己的状态（子弹槽位、空闲栈、尸体计时）也一起存档，
 * 对应真实 game 层要保存的 `game` 部分。
 */

const DT = 1 / 60;
const BOUNDS = { x: 0, y: 0, width: 300, height: 200 };
const CORPSE_SECONDS = 0.2;
const EVENTS = [
  'run:ended',
  'room:entered',
  'room:cleared',
  'entity:spawned',
  'entity:activated',
  'entity:damaged',
  'entity:died',
  'weapon:fired',
  'bullet:hit',
] as const;

interface Options {
  seed: number;
  floor: number;
  god: boolean;
  weapon: WeaponId | null;
  maxActors: number;
  maxBullets: number;
}
interface Slot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  remaining: number;
}
interface GameState {
  slots: Slot[];
  free: number[];
  corpses: [number, number][];
}
interface Save {
  sim: SimSnapshot;
  game: GameState;
}

class Harness {
  readonly bus = new EventBus<GameEvents>();
  readonly world: CombatWorld;
  readonly run: DungeonRun;
  readonly director: RoomDirector;
  readonly loot: LootSystem;
  readonly rewards: { rng: Random; upgrades: UpgradeId[]; offers: UpgradeId[] };
  readonly events: string[] = [];
  private slots: Slot[] = [];
  private free: number[] = [];
  private corpses = new Map<number, number>();

  constructor(
    readonly options: Options,
    snapshot?: Save,
  ) {
    const { seed } = options;
    const root = new Random(seed);
    this.world = createCombatWorld({
      seed,
      bus: this.bus,
      playerRules: PLAYER_RULES,
      godMode: options.god,
      maxActors: options.maxActors,
      maxBullets: options.maxBullets,
    });
    this.run = snapshot
      ? DungeonRun.restore(seed, this.bus, snapshot.sim.run)
      : new DungeonRun(seed, this.bus, options.floor);
    const floor = this.run.floor;
    this.director = new RoomDirector(this.world, this.run, root, BOUNDS, () => true, options.maxActors);
    this.loot = new LootSystem(root.fork(`loot:${floor}`));
    this.rewards = { rng: root.fork(`upgrades:${floor}`), upgrades: [], offers: [] };
    // 与 DemoSession 相同的监听顺序：DungeonRun 先计击杀，再掉落。
    this.bus.on('entity:died', (e) => {
      if (e.team === 'enemy') this.loot.enemy(e.x, e.y);
    });
    this.bus.on('room:cleared', () => this.loot.reward(150, 100));
    for (const name of EVENTS) {
      const log = (payload: unknown) => this.events.push(`${name} ${JSON.stringify(payload)}`);
      this.bus.on(name, log);
    }
    for (let i = 0; i < options.maxBullets; i++)
      this.slots.push({ id: 0, x: 0, y: 0, vx: 0, vy: 0, radius: 0, remaining: 0 });
    if (snapshot) {
      loadSim(this, snapshot.sim);
      this.slots = snapshot.game.slots.map((s) => ({ ...s }));
      this.free = [...snapshot.game.free];
      this.corpses = new Map(snapshot.game.corpses);
      return;
    }
    for (let i = options.maxBullets - 1; i >= 0; i--) this.free.push(i);
    this.world.spawnPlayer('ai_proto', 150, 100);
    if (options.weapon) this.world.takeWeapon(options.weapon);
    // 进入起点相邻的第一个战斗或 Boss 房。
    const room = this.run.room.links.find((id) => ['combat', 'boss'].includes(this.run.map.rooms[id]!.kind));
    if (room !== undefined) this.run.enter(room);
  }

  save(): Save {
    return {
      sim: saveSim(this),
      game: { slots: this.slots.map((s) => ({ ...s })), free: [...this.free], corpses: [...this.corpses] },
    };
  }

  /** 输入由 A 局的状态决定，再原样交给两局。 */
  input(rng: Random, step: number, out: InputFrame): void {
    if (step % 30 === 0) {
      const angle = rng.range(-Math.PI, Math.PI);
      out.move.x = rng.chance(0.3) ? 0 : Math.cos(angle);
      out.move.y = out.move.x === 0 ? 0 : Math.sin(angle);
    }
    out.fire = rng.chance(0.8);
    out.skillPressed = rng.chance(0.01);
    out.swapPressed = rng.chance(0.01);
    out.interactPressed = rng.chance(0.05);
    const p = this.player;
    let best = Infinity;
    out.aim = null;
    if (!p || rng.chance(0.2)) return;
    for (const a of this.world.actors) {
      if (a.team !== 'enemy' || a.phase !== 'active') continue;
      const dx = a.x - p.x,
        dy = a.y - (p.y - p.radius),
        d = Math.hypot(dx, dy);
      if (d > 0 && d < best) {
        best = d;
        out.aim = { x: dx / d, y: dy / d };
      }
    }
  }

  get player() {
    return this.world.playerId === null ? undefined : this.world.getActor(this.world.playerId);
  }

  step(input: Readonly<InputFrame>): void {
    const w = this.world;
    // 1. 「物理」：按上一步给出的速度移动；子弹出界算撞墙。
    for (const a of w.actors) {
      if (a.phase !== 'active') continue;
      const x = Math.min(BOUNDS.width - a.radius, Math.max(a.radius, a.x + a.vx * DT)),
        y = Math.min(BOUNDS.height - a.radius, Math.max(a.radius, a.y + a.vy * DT));
      w.syncPosition(a.id, x, y);
    }
    for (const s of this.slots) {
      if (!s.id) continue;
      s.x += s.vx * DT;
      s.y += s.vy * DT;
      if (s.x < 0 || s.y < 0 || s.x > BOUNDS.width || s.y > BOUNDS.height) {
        w.hitWall(s.id, s.x, s.y);
        this.recycle(s);
      }
    }
    // 2. 重叠：子弹按槽位顺序、实体按数组顺序（与 Arcade 的组对组顺序对应）。
    for (const s of this.slots) {
      if (!s.id) continue;
      for (const a of w.actors) {
        if (!s.id || a.phase !== 'active' || Math.hypot(a.x - s.x, a.y - s.y) > a.radius + s.radius) continue;
        if (w.hitActor(s.id, a.id, s.x, s.y)) this.recycle(s);
      }
    }
    const p = this.player;
    if (p && p.phase === 'active')
      for (const a of w.actors) {
        if (a.team !== 'enemy' || a.phase !== 'active') continue;
        if (Math.hypot(a.x - p.x, a.y - p.y) < a.radius + p.radius) w.contact(a.id, p.id);
      }
    // 3. WORLD_STEP：寿命 → step → 生成子弹 → 尸体回收 → 导演 → 拾取。
    for (const s of this.slots)
      if (s.id && (s.remaining -= DT) <= 0) {
        w.releaseBullet(s.id);
        this.recycle(s);
      }
    const result = w.step(DT, input);
    for (const b of result.bulletSpawns) {
      const index = this.free.pop();
      if (index === undefined) {
        w.releaseBullet(b.id);
        continue;
      }
      const s = this.slots[index]!;
      s.id = b.id;
      s.x = b.x;
      s.y = b.y;
      s.vx = Math.cos(b.angle) * b.speed;
      s.vy = Math.sin(b.angle) * b.speed;
      s.radius = b.radius;
      s.remaining = b.lifetime;
    }
    for (const a of [...w.actors]) {
      if (a.phase !== 'dead' || a.team !== 'enemy') continue;
      const t = (this.corpses.get(a.id) ?? 0) + DT;
      if (t >= CORPSE_SECONDS) {
        this.corpses.delete(a.id);
        w.removeActor(a.id);
      } else this.corpses.set(a.id, t);
    }
    this.director.step(DT);
    const q = this.player;
    if (q) this.loot.collect(w, q.x, q.y, input.interactPressed);
  }

  private recycle(s: Slot): void {
    if (!s.id) return;
    s.id = 0;
    this.free.push(this.slots.indexOf(s));
  }
}

/** 先跑 before 步，存档并经过 JSON，再让原局与读档局用同样的输入各跑 after 步。 */
function compare(options: Options, before: number | ((h: Harness) => boolean), after: number) {
  const inputs = new Random(options.seed).fork('inputs');
  const input = createInputFrame();
  const a = new Harness(options);
  const done = typeof before === 'number' ? (_: Harness, i: number) => i >= before : before;
  let i = 0;
  for (; !done(a, i); i++) {
    if (i > 6000) throw new Error('没有等到要存档的局面');
    a.input(inputs, i, input);
    a.step(input);
  }
  const saved = JSON.parse(JSON.stringify(a.save())) as Save;
  const b = new Harness(options, saved);
  expect(JSON.stringify(b.save())).toBe(JSON.stringify(saved));
  a.events.length = 0;
  for (const end = i + after; i < end; i++) {
    a.input(inputs, i, input);
    a.step(input);
    b.step(input);
  }
  expect(b.events).toEqual(a.events);
  expect(JSON.stringify(b.save())).toBe(JSON.stringify(a.save()));
  return { a, saved };
}

describe('存档 v2：存读档与不中断一致（ADR 0019）', () => {
  const base: Options = { seed: 1, floor: 1, god: false, weapon: null, maxActors: 31, maxBullets: 500 };
  for (const seed of [1, 2, 3, 4, 5])
    it(`战斗中存档，种子 ${seed}`, () => {
      const { a, saved } = compare({ ...base, seed }, 240 + seed * 37, 600);
      // 确认场景真的覆盖了战斗：存档时有存活或待刷的怪，之后发生过击杀。
      expect(saved.sim.run.phase).toBe('fighting');
      expect(a.events.some((e) => e.startsWith('entity:died'))).toBe(true);
    });

  it('穿透弹：发射者或已命中目标被回收后，子弹仍能往返', () => {
    // 存档时机：存在一颗子弹，它的发射者或已命中的目标已经不在 actors 里。
    const stale = (h: Harness) => {
      const s = h.world.save(),
        live = new Set(s.actors.map((x) => x.id));
      return s.bullets.some((b) => !live.has(b.ownerId) || b.hitIds.some((id) => !live.has(id)));
    };
    compare({ ...base, seed: 7, god: true, weapon: 'sniper_pierce' }, stale, 600);
  });

  it('满池：子弹池用满时，空闲栈顺序往返', () => {
    const full = (h: Harness) => h.save().game.free.length === 0;
    const options: Options = { ...base, seed: 3, god: true, weapon: 'ring_staff', maxBullets: 8 };
    const { saved } = compare(options, full, 600);
    expect(saved.game.free).toEqual([]);
  });

  it('满池：实体池放不下时，待刷数往返', () => {
    const pending = (h: Harness) => h.save().sim.director.pending > 0;
    const { saved } = compare({ ...base, seed: 3, god: true, maxActors: 3 }, pending, 600);
    expect(saved.sim.director.pending).toBeGreaterThan(0);
  });

  it('Boss 层：阶段切换前后存档', () => {
    const { a } = compare({ ...base, seed: 11, floor: 4, god: true, weapon: 'heavy_cannon' }, 600, 900);
    expect(a.events.some((e) => e.includes('boss_ring') || e.includes('boss_storm'))).toBe(true);
  });

  it('合法负值：负速度、负 AI 冷却原样往返', () => {
    const negative = (h: Harness) => {
      const actors = h.save().sim.world.actors;
      return actors.some((x) => x.vx < 0 || x.vy < 0) && actors.some((x) => x.brain.cooldown < 0);
    };
    const { saved } = compare({ ...base, seed: 5 }, negative, 120);
    const actors = saved.sim.world.actors;
    expect(actors.some((x) => x.vx < 0 || x.vy < 0)).toBe(true);
    expect(actors.some((x) => x.brain.cooldown < 0)).toBe(true);
  });

  it('出口三选一：升级候选与随机流往返', () => {
    const a = new Harness({ ...base, seed: 9 });
    const candidates = Object.keys(UPGRADES) as UpgradeId[];
    a.rewards.rng.shuffle(candidates);
    a.rewards.offers.push(...candidates.slice(0, 3));
    a.rewards.upgrades.push('power');
    const saved = JSON.parse(JSON.stringify(a.save())) as Save;
    const b = new Harness({ ...base, seed: 9 }, saved);
    expect(b.rewards.offers).toEqual(a.rewards.offers);
    expect(b.rewards.upgrades).toEqual(['power']);
    expect(b.rewards.rng.next()).toBe(a.rewards.rng.next());
  });

  it('读档不发任何事件', () => {
    const a = new Harness({ ...base, seed: 2 });
    const input = createInputFrame();
    input.fire = true;
    for (let i = 0; i < 300; i++) a.step(input);
    const b = new Harness({ ...base, seed: 2 }, JSON.parse(JSON.stringify(a.save())) as Save);
    expect(b.events).toEqual([]);
  });

  it('load 只接受刚创建的世界；事件回调中途不能存档', () => {
    const a = new Harness({ ...base, seed: 1 });
    expect(() => a.world.load(a.world.save())).toThrow();
    const errors: unknown[] = [];
    a.bus.on('bullet:hit', () => {
      try {
        a.world.save();
      } catch (e) {
        errors.push(e);
      }
    });
    const input = createInputFrame();
    input.fire = true;
    for (let i = 0; i < 120 && !errors.length; i++) a.step(input);
    expect(errors.length).toBeGreaterThan(0);
  });
});
