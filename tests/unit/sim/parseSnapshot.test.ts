import { describe, expect, it } from 'vitest';
import { PLAYER_RULES } from '../../../src/data/player';
import { createSimSnapshotSchema } from '../../../src/data/schema/save';
import { simSaveFields } from '../../../src/data/saveFields';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { Random } from '../../../src/sim/core/Random';
import { createInputFrame } from '../../../src/sim/core/types';
import { LootSystem } from '../../../src/sim/loot/LootSystem';
import { DungeonRun } from '../../../src/sim/run/DungeonRun';
import { RoomDirector } from '../../../src/sim/run/RoomDirector';
import { createSimDecoder, validateSaveFields } from '../../../src/sim/run/parseSnapshot';
import { saveSim, type SimSnapshot } from '../../../src/sim/run/snapshot';

const limits = { actors: 31, bullets: 500 },
  fields = simSaveFields(limits),
  schema = createSimSnapshotSchema(limits),
  decode = createSimDecoder(limits);
function sample(): SimSnapshot {
  const bus = new EventBus<GameEvents>(),
    rng = new Random(42);
  const world = createCombatWorld({ seed: 42, bus, playerRules: PLAYER_RULES });
  world.spawnPlayer('ai_proto', 150, 100);
  world.takeWeapon('sniper_pierce');
  const run = new DungeonRun(42, bus),
    director = new RoomDirector(world, run, rng, { x: 0, y: 0, width: 300, height: 200 }, () => true),
    loot = new LootSystem(rng.fork('loot:1'));
  run.enter(run.room.links[0]!);
  loot.enterRoom(run.roomId);
  const target = world.spawnEnemy('naiwa_chaser', 200, 100),
    input = createInputFrame();
  for (let i = 0; i < 120; i++) world.step(1 / 60, input);
  input.fire = true;
  const bullet = world.step(1 / 60, input).bulletSpawns[0]!;
  world.hitActor(bullet.id, target, 200, 100);
  world.removeActor(target);
  return saveSim({
    world,
    run,
    director,
    loot,
    rewards: { rng: rng.fork('upgrades:1'), upgrades: [], offers: [] },
  });
}

describe('完整 sim 存档字段与业务校验', () => {
  it('JSON 往返接受真实 save，包括指向已回收目标的穿透记录；不改写输入', () => {
    const s = JSON.parse(JSON.stringify(sample())) as SimSnapshot;
    expect(s.world.bullets[0]!.hitIds.length).toBe(1);
    const before = JSON.stringify(s);
    expect(schema.safeParse(s).success).toBe(true);
    expect(decode(s, 42)).toBe(s);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('挥动中快照通过两套字段规则，拒绝异常计时、武器与重复命中记录', () => {
    const s = sample();
    const world = createCombatWorld({ seed: 42, bus: new EventBus<GameEvents>() });
    world.load(s.world);
    world.takeWeapon('cutlass');
    const input = createInputFrame();
    input.fire = true;
    for (let i = 0; i < 180 && !world.melee.active; i++) world.step(1 / 60, input);
    s.world = world.save();
    expect(s.world.melee.active).toBe(true);
    expect(validateSaveFields(s, fields)).toBe(true);
    expect(schema.safeParse(s).success).toBe(true);
    expect(decode(s, 42)).toBe(s);
    for (const change of [
      { remaining: s.world.melee.duration + 1 },
      { weaponId: 'pistol_basic' as const },
      { hitIds: [s.world.playerId!] },
      { hitIds: [s.world.nextId, s.world.nextId] },
      { active: false },
    ]) {
      const copy = structuredClone(s);
      Object.assign(copy.world.melee, change);
      expect(decode(copy, 42)).toBeNull();
    }
  });
  it('合法负坐标、速度、击退计时、AI 冷却不被夹掉；已回收 owner 仍合法', () => {
    const s = sample(),
      a = s.world.actors[0]!;
    a.x = a.y = a.vx = a.vy = a.baseX = a.baseY = a.facing = -1;
    a.brain.cooldown = a.brain.time = a.knock.timeLeft = -0.01;
    const b = s.world.bullets[0]!;
    b.ownerId = s.world.nextId++;
    expect(schema.safeParse(s).success).toBe(true);
    expect(decode(s, 42)).toBe(s);
  });
  it('每个字段缺失、类型错误与非有限数字：轻量解析和 zod 成对拒绝', () => {
    const original = sample();
    const paths: string[][] = [];
    function visit(v: unknown, path: string[]): void {
      if (!v || typeof v !== 'object') return;
      for (const key of Array.isArray(v) ? (v.length ? ['0'] : []) : Object.keys(v)) {
        paths.push([...path, key]);
        visit((v as Record<string, unknown>)[key], [...path, key]);
      }
    }
    visit(original, []);
    for (const path of paths) {
      for (const bad of [undefined, {}, NaN, Infinity, -Infinity]) {
        const copy = structuredClone(original);
        let target = copy as unknown as Record<string, unknown>;
        for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
        target[path.at(-1)!] = bad;
        expect(validateSaveFields(copy, fields), `${path.join('.')}:${bad}`).toBe(false);
        expect(schema.safeParse(copy).success, path.join('.')).toBe(false);
      }
    }
  });
  const invalid: [string, (s: SimSnapshot) => void][] = [
    [
      'rng',
      (s) => {
        s.world.rng.crit = -1;
      },
    ],
    [
      'fractional rng',
      (s) => {
        s.loot.rng = 1.5;
      },
    ],
    [
      'player missing',
      (s) => {
        s.world.actors.length = 0;
      },
    ],
    [
      'duplicate IDs',
      (s) => {
        s.world.actors.push({ ...s.world.actors[0]! });
      },
    ],
    [
      'next ID',
      (s) => {
        s.world.nextId = 1;
      },
    ],
    [
      'source',
      (s) => {
        s.world.bullets[0]!.source = 'missing';
      },
    ],
    [
      'enemy source',
      (s) => {
        s.world.bullets[0]!.team = 'enemy';
      },
    ],
    [
      'owner is bullet',
      (s) => {
        s.world.bullets[0]!.ownerId = s.world.bullets[0]!.id;
      },
    ],
    [
      'duplicate hit',
      (s) => {
        s.world.bullets[0]!.hitIds.push(s.world.bullets[0]!.hitIds[0]!);
      },
    ],
    [
      'future hit',
      (s) => {
        s.world.bullets[0]!.hitIds[0] = s.world.nextId;
      },
    ],
    [
      'map length',
      (s) => {
        s.run.visited.pop();
      },
    ],
    [
      'room index',
      (s) => {
        s.run.roomId = 24;
      },
    ],
    [
      'floor',
      (s) => {
        s.director.floor++;
      },
    ],
    [
      'loot room',
      (s) => {
        s.loot.room++;
      },
    ],
    [
      'loot slots',
      (s) => {
        s.loot.slots.pop();
      },
    ],
    [
      'upgrade count',
      (s) => {
        s.rewards.upgrades.push('power');
      },
    ],
    [
      'offers outside exit',
      (s) => {
        s.rewards.offers = ['power', 'plating', 'vitality'];
      },
    ],
    [
      'radius',
      (s) => {
        s.world.actors[0]!.radius++;
      },
    ],
    [
      'health',
      (s) => {
        s.world.actors[0]!.hp = 0;
      },
    ],
    [
      'phase',
      (s) => {
        s.world.actors[0]!.phase = 'dead';
      },
    ],
    [
      'armor',
      (s) => {
        s.world.resources.armor = s.world.resources.maxArmor + 1;
      },
    ],
    [
      'unbounded regen',
      (s) => {
        s.world.resources.regenTime = Number.MAX_SAFE_INTEGER;
      },
    ],
    [
      'zero fire scale',
      (s) => {
        s.world.resources.fireRateScale = 0;
      },
    ],
    [
      'negative cooldown',
      (s) => {
        s.world.player!.cooldown = -1;
      },
    ],
    [
      'missing equipped slot',
      (s) => {
        s.world.secondaryWeapon = null;
      },
    ],
    [
      'capacity',
      (s) => {
        s.world.bullets = Array.from({ length: limits.bullets + 1 }, () => s.world.bullets[0]!);
      },
    ],
  ];
  it.each(invalid)('拒绝 %s', (_name, mutate) => {
    const s = sample();
    mutate(s);
    expect(decode(s, 42)).toBeNull();
  });
});
