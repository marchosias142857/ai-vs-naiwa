import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../../src/data/balance';
import { ROOM_LAYOUTS } from '../../../src/data/layouts';
import { ROOM_RULES } from '../../../src/data/rooms';
import { RoomThemeSchema, TrapRulesSchema, type TrapPlacement } from '../../../src/data/schema/traps';
import { ROOM_THEMES, TRAP_RULES } from '../../../src/data/traps';
import { WEAPONS } from '../../../src/data/weapons';
import {
  createCombatWorld,
  type CombatWorld,
  type CombatWorldOptions,
  type TrapLayoutInput,
} from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';
import { GRAYBOX_BOUNDS as B } from '../../../src/game/world/graybox';

/** ADR 0032 房间机关。物理用最小的速度积分代替 Arcade。 */
const DT = 1 / 60;

function trap(kind: TrapLayoutInput['kind'], x: number, y: number, extra: Partial<TrapLayoutInput> = {}) {
  const round = kind === 'mine' || kind === 'barrel';
  return {
    kind,
    x,
    y,
    width: round ? 0 : 32,
    height: round ? 0 : 32,
    radius: kind === 'mine' ? TRAP_RULES.mine.radius : kind === 'barrel' ? TRAP_RULES.barrel.radius : 0,
    angle: 0,
    delay: 0,
    ...extra,
  } satisfies TrapLayoutInput;
}

function setup(extra: Partial<CombatWorldOptions> = {}) {
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed: 9, bus, ...extra });
  const hurt = new Map<number, number>();
  const log: string[] = [];
  bus.on('entity:damaged', (e) => hurt.set(e.id, (hurt.get(e.id) ?? 0) + e.amount));
  bus.on('combat:exploded', (e) => log.push(`boom:${e.team}`));
  const input = createInputFrame();
  input.aim = { x: 1, y: 0 };
  const pins = new Map<number, [number, number]>();
  const step = (n = 1, each?: (w: CombatWorld) => void) => {
    for (let i = 0; i < n; i++) {
      for (const a of world.actors) {
        if (a.phase !== 'active') continue;
        const pin = pins.get(a.id);
        world.syncPosition(a.id, pin ? pin[0] : a.x + a.vx * DT, pin ? pin[1] : a.y + a.vy * DT);
      }
      for (const b of world.step(DT, input).bulletSpawns) world.releaseBullet(b.id);
      each?.(world);
    }
  };
  const pin = (id: number, x: number, y: number) => {
    pins.set(id, [x, y]);
    world.syncPosition(id, x, y);
  };
  return { world, bus, input, step, pin, pins, hurt, log };
}

describe('地刺', () => {
  it('收起 → 预警 → 刺出，刺出时伤害站在上面的所有角色，每次刺出每人最多一次', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 100, 100);
    const enemy = t.world.spawnEnemy('naiwa_tank', 104, 100);
    t.pin(player, 100, 100);
    t.pin(enemy, 104, 100);
    t.world.setTraps(1, [trap('spikes', 100, 100, { width: 48, height: 32 })]);
    const r = TRAP_RULES.spikes;
    const states: string[] = [];
    t.step(Math.ceil((r.rest + r.warn + r.up) / DT) + 2, (w) => {
      const s = w.traps[0]!.state;
      if (states[states.length - 1] !== s) states.push(s);
    });
    expect(states).toEqual(['idle', 'warn', 'on', 'idle']);
    expect(t.hurt.get(enemy)).toBe(r.damage);
    // 玩家先吃到护甲，伤害事件的数值与怪物相同
    expect(t.hurt.get(player)).toBe(r.damage);
  });
});

describe('水流与海草', () => {
  it('水流把区域里的角色往水流方向推，冻住或站着不动的怪也会被冲走；海草让角色减速', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 60, 60);
    t.world.setTraps(1, [
      trap('current', 60, 60, { width: 40, height: 40, angle: Math.PI / 2 }),
      trap('weed', 200, 60, { width: 40, height: 40 }),
    ]);
    t.step(1);
    expect(t.world.getActor(player)!.vy).toBeCloseTo(TRAP_RULES.current.speed, 5);
    t.pin(player, 200, 60);
    t.input.move = { x: 1, y: 0 };
    t.step(40);
    const v = t.world.getActor(player)!.vx;
    expect(v).toBeGreaterThan(0);
    expect(v).toBeCloseTo(90 * TRAP_RULES.weed.slow, 0);
  });
});

describe('泡泡地雷', () => {
  it('怪物碰到就点燃，爆炸伤害范围内所有角色，之后重新布设', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 120, 100);
    const enemy = t.world.spawnEnemy('naiwa_tank', 60, 100);
    t.pin(player, 120, 100);
    t.world.setTraps(1, [trap('mine', 100, 100)]);
    t.step(40);
    // 坦克慢慢走向玩家，经过地雷
    t.step(240);
    expect(t.log).toContain('boom:null');
    expect(t.hurt.get(enemy)).toBeGreaterThanOrEqual(TRAP_RULES.mine.damage);
    expect(t.hurt.get(player)).toBeGreaterThanOrEqual(TRAP_RULES.mine.damage);
    expect(t.world.traps[0]!.state).not.toBe('armed');
    t.pins.set(enemy, [20, 20]);
    t.world.syncPosition(enemy, 20, 20);
    t.step(Math.ceil(TRAP_RULES.mine.rearm / DT) + 2);
    expect(t.world.traps[0]!.state).toBe('armed');
  });
});

describe('鱼雷桶', () => {
  it('挡视线；子弹扣耐久，打爆后爆炸伤害所有角色并连锁引爆旁边的桶', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 40, 100);
    const enemy = t.world.spawnEnemy('naiwa_tank', 100, 112);
    t.pin(player, 40, 100);
    t.pin(enemy, 100, 112);
    t.world.setTraps(1, [trap('barrel', 100, 100), trap('barrel', 125, 100)]);
    t.step(40);
    t.world.equipWeapon('sniper_pierce');
    t.input.fire = true;
    const spawn = t.world.step(DT, t.input).bulletSpawns[0]!;
    t.input.fire = false;
    expect(t.world.hitTrap(spawn.id, 0, 93, 100)).toBe(true);
    // 狙击 12 伤害 > 桶的 8 耐久：一枪打爆，爆炸波及第二个桶，连锁再炸一次
    expect(t.log).toEqual(['boom:null', 'boom:null']);
    expect(t.world.traps.filter((x) => x.active && x.state === 'broken')).toHaveLength(2);
    expect(t.hurt.get(enemy)).toBeGreaterThanOrEqual(TRAP_RULES.barrel.damage * 2);
    expect(t.hurt.get(player)).toBeUndefined();
  });

  it('近战与特殊弹体也能打爆鱼雷桶', () => {
    // 玩家离桶很近，用无敌免得被第一个桶炸死。
    const t = setup({ godMode: true });
    const player = t.world.spawnPlayer('ai_proto', 80, 100);
    t.pin(player, 80, 100);
    t.world.setTraps(1, [trap('barrel', 100, 100), trap('barrel', 200, 100)]);
    t.world.equipWeapon('anchor_hammer');
    t.input.fire = true;
    t.step(2);
    t.input.fire = false;
    t.step(30);
    expect(t.world.traps[0]!.state).toBe('broken');
    t.world.equipWeapon('octo_bazooka');
    t.step(60);
    t.input.fire = true;
    t.step(1);
    t.input.fire = false;
    t.step(80);
    expect(t.world.traps[1]!.state).toBe('broken');
  });
});

describe('摆放与存档', () => {
  it('同一房间重复摆放不重置进行中的状态；换房重新开始', () => {
    const t = setup();
    t.world.spawnPlayer('ai_proto', 20, 20);
    const layout = [trap('spikes', 100, 100, { delay: 0.5 })];
    t.world.setTraps(3, layout);
    t.step(90);
    const before = t.world.traps[0]!.state;
    t.world.setTraps(3, layout);
    expect(t.world.traps[0]!.state).toBe(before);
    t.world.setTraps(4, layout);
    expect(t.world.traps[0]!.state).toBe('idle');
  });

  it('地刺、地雷、鱼雷桶进行中存档，恢复后继续的结果逐项一致', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 100, 100);
    t.world.spawnEnemy('naiwa_tank', 40, 100);
    t.pin(player, 100, 100);
    t.world.setTraps(7, [
      trap('spikes', 100, 100, { width: 40, height: 20, delay: 1 }),
      trap('mine', 70, 100),
      trap('barrel', 150, 60),
      trap('current', 60, 60, { width: 40, height: 24, angle: Math.PI }),
    ]);
    t.step(130);
    const saved = JSON.parse(JSON.stringify(t.world.save())) as ReturnType<CombatWorld['save']>;
    const copy = setup();
    copy.world.load(saved);
    for (const [id, p] of t.pins) copy.pins.set(id, p);
    copy.input.aim = { x: 1, y: 0 };
    expect(copy.world.save()).toEqual(t.world.save());
    t.step(200);
    copy.step(200);
    expect(copy.world.save()).toEqual(t.world.save());
  });
});

describe('房间主题数据', () => {
  const entrances = [
    [-(B.width / 2 - ROOM_RULES.entranceInset), 0],
    [B.width / 2 - ROOM_RULES.entranceInset, 0],
    [0, -(B.height / 2 - ROOM_RULES.entranceInset)],
    [0, B.height / 2 - ROOM_RULES.entranceInset],
  ] as const;
  /** 机关的包围盒（相对房间中心）。 */
  const bounds = (t: TrapPlacement) => {
    const r = t.kind === 'mine' ? TRAP_RULES.mine.radius : t.kind === 'barrel' ? TRAP_RULES.barrel.radius : 0;
    const hw = t.width ? t.width / 2 : r,
      hh = t.height ? t.height / 2 : r;
    return { x0: t.x - hw, x1: t.x + hw, y0: t.y - hh, y1: t.y + hh };
  };

  it('规则与主题符合 schema，机关数不超过槽位', () => {
    expect(TrapRulesSchema.safeParse(TRAP_RULES).success).toBe(true);
    for (const theme of ROOM_THEMES) {
      const r = RoomThemeSchema.safeParse(theme);
      expect(r.success, r.error?.message).toBe(true);
      for (const plan of theme.plans) {
        expect(plan.layout).toBeLessThan(ROOM_LAYOUTS.length);
        expect(plan.traps.length).toBeLessThanOrEqual(BALANCE.trapCapacity);
      }
    }
  });

  it('机关在房间里、不压内墙、不挡四个门口的入场点', () => {
    for (const theme of ROOM_THEMES)
      for (const plan of theme.plans) {
        const boxes = ROOM_LAYOUTS[plan.layout]!;
        for (const t of plan.traps as readonly TrapPlacement[]) {
          const b = bounds(t);
          const where = `${theme.art} 布局 ${plan.layout} ${t.kind} (${t.x}, ${t.y})`;
          expect(b.x0 >= -B.width / 2 && b.x1 <= B.width / 2, where).toBe(true);
          expect(b.y0 >= -B.height / 2 && b.y1 <= B.height / 2, where).toBe(true);
          for (const w of boxes) {
            const overlap =
              b.x1 > w.x - w.width / 2 &&
              b.x0 < w.x + w.width / 2 &&
              b.y1 > w.y - w.height / 2 &&
              b.y0 < w.y + w.height / 2;
            expect(overlap, `${where} 压到内墙`).toBe(false);
          }
          // 入场点周围留出玩家身体加一点余量
          const margin = 8;
          for (const [ex, ey] of entrances) {
            const near = ex > b.x0 - margin && ex < b.x1 + margin && ey > b.y0 - margin && ey < b.y1 + margin;
            expect(near, `${where} 挡住入场点 (${ex}, ${ey})`).toBe(false);
          }
        }
      }
  });

  it('新武器的特殊弹体撞桶按墙处理并扣耐久（ADR 0031 × 0032）', () => {
    expect(WEAPONS.octo_bazooka.shot.burst.damage).toBeGreaterThanOrEqual(TRAP_RULES.barrel.hp);
  });
});
