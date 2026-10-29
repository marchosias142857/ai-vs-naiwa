import { describe, expect, it } from 'vitest';
import { WEAPONS, type WeaponId } from '../../../src/data/weapons';
import { PLAYER_RULES } from '../../../src/data/player';
import { createCombatWorld, type CombatWorld, type CombatWorldOptions } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';

/**
 * ADR 0031 特殊弹体、光束、蓄力、预热与突进近战。
 * 用最小的「物理」代替 Arcade：按速度积分位置；墙是房间边界加若干方块，视线按线段与方块相交判断。
 */
const DT = 1 / 60;
const BOUNDS = { x: 0, y: 0, width: 300, height: 200 };
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 线段与轴对齐方块相交（Liang–Barsky）。 */
function hits(b: Box, x1: number, y1: number, x2: number, y2: number): boolean {
  let t0 = 0,
    t1 = 1;
  const dx = x2 - x1,
    dy = y2 - y1;
  const edges: [number, number][] = [
    [-dx, x1 - b.x],
    [dx, b.x + b.w - x1],
    [-dy, y1 - b.y],
    [dy, b.y + b.h - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function setup(boxes: Box[] = [], extra: Partial<CombatWorldOptions> = {}) {
  // 房间四周的墙也是方块，弹体撞墙、光束量长度都走同一套视线。
  const walls: Box[] = [
    { x: -20, y: -20, w: 340, h: 20 },
    { x: -20, y: 200, w: 340, h: 20 },
    { x: -20, y: 0, w: 20, h: 200 },
    { x: 300, y: 0, w: 20, h: 200 },
    ...boxes,
  ];
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({
    seed: 5,
    bus,
    bounds: BOUNDS,
    godMode: true,
    lineOfSight: (x1, y1, x2, y2) => !walls.some((b) => hits(b, x1, y1, x2, y2)),
    ...extra,
  });
  const damage = new Map<number, number[]>();
  const log: string[] = [];
  bus.on('entity:damaged', (e) => {
    if (e.team === 'enemy') damage.set(e.id, [...(damage.get(e.id) ?? []), e.amount]);
  });
  bus.on('weapon:fired', () => log.push('fired'));
  bus.on('weapon:chained', () => log.push('chained'));
  bus.on('combat:exploded', () => log.push('exploded'));
  const input = createInputFrame();
  input.aim = { x: 1, y: 0 };
  const pins = new Map<number, [number, number]>();
  const step = (n = 1, each?: (w: CombatWorld) => void) => {
    for (let i = 0; i < n; i++) {
      for (const a of world.actors) {
        if (a.phase !== 'active') continue;
        const pin = pins.get(a.id);
        const x = pin ? pin[0] : a.x + a.vx * DT,
          y = pin ? pin[1] : a.y + a.vy * DT;
        world.syncPosition(a.id, x, y);
      }
      for (const b of world.step(DT, input).bulletSpawns) world.releaseBullet(b.id);
      each?.(world);
    }
  };
  const enemy = (kind: Parameters<CombatWorld['spawnEnemy']>[0], x: number, y: number, pinned = true) => {
    const id = world.spawnEnemy(kind, x, y);
    if (pinned) pins.set(id, [x, y]);
    return id;
  };
  const player = (x: number, y: number, weapon: WeaponId, pinned = true) => {
    const id = world.spawnPlayer('ai_proto', x, y);
    world.equipWeapon(weapon);
    if (pinned) pins.set(id, [x, y]);
    return id;
  };
  const active = () => world.shots.filter((s) => s.active);
  return { world, bus, input, step, enemy, player, pins, damage, log, active };
}

/** 等怪物出场预警结束。 */
const WARMUP = 40;

describe('特殊弹体', () => {
  it('章鱼火箭筒：命中造成直击伤害并爆炸，波及旁边的敌人；撞墙也会爆炸', () => {
    const t = setup([{ x: 200, y: 150, w: 20, h: 40 }]);
    t.player(50, 100, 'octo_bazooka');
    const a = t.enemy('naiwa_tank', 150, 100),
      b = t.enemy('naiwa_tank', 160, 118);
    t.step(WARMUP);
    t.input.fire = true;
    t.step(1);
    t.input.fire = false;
    t.step(80);
    expect(t.log.filter((e) => e === 'exploded')).toHaveLength(1);
    const direct = t.damage.get(a)!,
      splash = t.damage.get(b)!;
    // 直击 6 + 爆炸 12（暴击翻倍）
    expect(direct).toHaveLength(2);
    expect(direct[0]).toBeGreaterThanOrEqual(6);
    expect(direct[1]).toBe(12);
    expect(splash).toEqual([12]);
    // 朝方块开一炮：撞墙爆炸
    t.world.syncPosition(t.world.playerId!, 210, 60);
    t.pins.set(t.world.playerId!, [210, 60]);
    t.input.aim = { x: 0, y: 1 };
    t.step(30);
    t.input.fire = true;
    t.step(1);
    t.input.fire = false;
    t.step(60);
    expect(t.log.filter((e) => e === 'exploded')).toHaveLength(2);
  });

  it('电鳗法杖：命中后连锁跳到附近的新目标，伤害逐跳衰减', () => {
    const t = setup();
    t.player(40, 100, 'eel_staff');
    const ids = [120, 170, 220].map((x) => t.enemy('naiwa_tank', x, 100));
    t.step(WARMUP);
    t.input.fire = true;
    t.step(1);
    t.input.fire = false;
    t.step(60);
    expect(t.log.filter((e) => e === 'chained')).toHaveLength(2);
    const hit = ids.map((id) => t.damage.get(id)?.[0] ?? 0);
    const base = WEAPONS.eel_staff.damage,
      falloff = WEAPONS.eel_staff.chain.falloff;
    // 第 k 跳的伤害是基础伤害 × falloff^k，各跳独立判定暴击（×2）。
    for (let k = 0; k < 3; k++)
      expect([1, 2]).toContain(Math.round((hit[k]! / (base * falloff ** k)) * 100) / 100);
  });

  it('鲨鳍回旋镖：同时只能扔一个，去程回程各打一次，接住后才能再扔', () => {
    const t = setup();
    t.player(60, 100, 'fin_boomerang');
    const target = t.enemy('naiwa_tank', 130, 100);
    t.step(WARMUP);
    t.input.fire = true;
    let most = 0;
    t.step(150, () => (most = Math.max(most, t.active().length)));
    expect(most).toBe(1);
    const throws = t.log.filter((e) => e === 'fired').length;
    expect(throws).toBeGreaterThanOrEqual(2);
    // 已经接住的每次投掷，去程、回程各命中一次
    expect(t.damage.get(target)!.length).toBeGreaterThanOrEqual(2 * (throws - 1));
  });

  it('河豚魔杖：小河豚会转向偏离瞄准线的敌人', () => {
    const t = setup();
    t.player(50, 100, 'puffer_wand');
    const target = t.enemy('naiwa_tank', 160, 150);
    t.step(WARMUP);
    t.input.fire = true;
    t.step(1);
    t.input.fire = false;
    t.step(100);
    expect(t.damage.get(target)?.length).toBe(2);
  });

  it('海胆榴弹：飞到头后炸出 8 根小刺', () => {
    const t = setup();
    t.player(50, 100, 'urchin_mortar');
    t.step(1);
    t.input.fire = true;
    t.step(1);
    t.input.fire = false;
    t.step(Math.ceil(WEAPONS.urchin_mortar.shot.life / DT) + 1);
    const spines = t.active().filter((s) => s.child);
    expect(spines).toHaveLength(WEAPONS.urchin_mortar.shot.split.count);
    const angles = spines.map((s) => Math.atan2(Math.sin(s.angle), Math.cos(s.angle))).sort((p, q) => p - q);
    // 均匀分布一圈
    for (let i = 1; i < angles.length; i++) expect(angles[i]! - angles[i - 1]!).toBeCloseTo(Math.PI / 4, 5);
  });

  it('弹弹水枪：撞墙反弹，次数用完后消失', () => {
    const t = setup();
    t.player(250, 100, 'bubble_bouncer');
    t.step(1);
    t.input.fire = true;
    t.step(1);
    t.input.fire = false;
    let flipped = false;
    t.step(30, () => {
      const s = t.active()[0];
      if (s && Math.cos(s.angle) < -0.9) flipped = true;
    });
    expect(flipped).toBe(true);
    expect(t.world.save().shots[0]!.bounces).toBe(WEAPONS.bubble_bouncer.shot.bounces - 1);
  });

  it('水母护卫：最多 4 只，绕玩家转圈，碰到敌人隔一段时间再电一次', () => {
    const t = setup();
    const player = t.player(150, 100, 'jelly_guard');
    const target = t.enemy('naiwa_tank', 150 + WEAPONS.jelly_guard.shot.orbit, 100);
    t.step(WARMUP);
    t.input.fire = true;
    let most = 0;
    t.step(240, () => {
      const p = t.world.getActor(player)!;
      most = Math.max(most, t.active().length);
      // 刚发射的那一步还在枪口，下一步才入轨。
      for (const s of t.active())
        if (s.time > 0)
          expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeCloseTo(WEAPONS.jelly_guard.shot.orbit, 0);
    });
    expect(most).toBe(WEAPONS.jelly_guard.shot.max);
    expect(t.damage.get(target)!.length).toBeGreaterThanOrEqual(4);
  });
});

describe('开火方式', () => {
  it('珊瑚长弓：按住只蓄力，松开发射；蓄满伤害 ×4 并穿透，轻点只有基础伤害', () => {
    const t = setup();
    t.player(30, 100, 'coral_bow');
    const line = [100, 140, 180, 220].map((x) => t.enemy('naiwa_tank', x, 100));
    t.step(WARMUP);
    t.input.fire = true;
    t.step(60);
    expect(t.log).not.toContain('fired');
    expect(t.world.charge).toBe(1);
    t.input.fire = false;
    t.step(60);
    expect(t.log).toEqual(['fired']);
    for (const id of line) expect(t.damage.get(id)![0]).toBeGreaterThanOrEqual(16);
    t.input.fire = true;
    t.step(1);
    t.input.fire = false;
    t.step(60);
    expect([4, 8]).toContain(t.damage.get(line[0]!)![1]);
    expect(t.damage.get(line[1]!)).toHaveLength(1);
  });

  it('灯笼鱼光枪：按住时射到墙为止，持续伤害光束上的敌人，按间隔扣能量', () => {
    const t = setup([{ x: 160, y: 50, w: 20, h: 100 }], { playerRules: PLAYER_RULES });
    t.player(50, 100, 'lantern_beam');
    const front = t.enemy('naiwa_tank', 120, 100),
      back = t.enemy('naiwa_tank', 230, 100);
    t.step(WARMUP);
    const energy = t.world.resources.energy;
    t.input.fire = true;
    t.step(60);
    const beam = t.world.beam;
    expect(beam.active).toBe(true);
    expect(beam.x + beam.length).toBeCloseTo(160, 0);
    expect(t.damage.get(front)!.length).toBe(10);
    expect(t.damage.get(back)).toBeUndefined();
    expect(energy - t.world.resources.energy).toBe(4);
    expect(t.log).toEqual(['fired']);
    t.input.fire = false;
    t.step(1);
    expect(t.world.beam.active).toBe(false);
  });

  it('泡泡加特林：射速越打越快，开火时移动变慢', () => {
    const t = setup();
    t.player(30, 100, 'bubble_gatling', false);
    t.step(1);
    t.input.fire = true;
    t.step(30);
    const early = t.log.length;
    t.step(60);
    const before = t.log.length;
    t.step(30);
    const late = t.log.length - before;
    expect(early).toBeLessThan(5);
    expect(late).toBeGreaterThanOrEqual(6);
    t.input.move = { x: 0, y: 1 };
    t.step(30);
    const speed = Math.hypot(
      t.world.getActor(t.world.playerId!)!.vx,
      t.world.getActor(t.world.playerId!)!.vy,
    );
    expect(speed).toBeCloseTo(90 * WEAPONS.bubble_gatling.spinup.moveScale, 0);
  });

  it('冰沙喷枪：叠层减速，叠满冻住不动、没有接触伤害；Boss 只减速不冻结', () => {
    const t = setup();
    const player = t.player(40, 100, 'slush_blaster');
    const chaser = t.enemy('naiwa_tank', 80, 100, false);
    t.step(WARMUP);
    t.input.fire = true;
    let slowed = false;
    for (let i = 0; i < 120 && !t.world.getActor(chaser)!.frozen; i++) {
      t.step(1);
      const c = t.world.getActor(chaser)!;
      if (!c.frozen && c.chill > 0) slowed = true;
    }
    t.input.fire = false;
    const c = t.world.getActor(chaser)!;
    expect(slowed).toBe(true);
    expect(c.frozen).toBe(true);
    t.step(1);
    expect(Math.hypot(c.vx, c.vy)).toBe(0);
    const hp = t.world.getActor(player)!.hp;
    t.world.contact(chaser, player);
    expect(t.world.getActor(player)!.hp).toBe(hp);
    t.step(Math.ceil(WEAPONS.slush_blaster.chill.freeze / DT) + 1);
    expect(c.frozen).toBe(false);
    expect(c.chill).toBe(0);

    const b = setup();
    b.player(40, 100, 'slush_blaster');
    const boss = b.enemy('naiwa_boss', 80, 100);
    b.step(WARMUP);
    b.input.fire = true;
    let frozen = false,
      most = 0;
    b.step(120, () => {
      frozen ||= b.world.getActor(boss)!.frozen;
      most = Math.max(most, b.world.getActor(boss)!.chill);
    });
    expect(frozen).toBe(false);
    expect(most).toBeCloseTo(WEAPONS.slush_blaster.chill.slow, 5);
  });
});

describe('突进近战', () => {
  it('剑鱼长枪前冲一小段；鲨齿太刀冲刺斩更远，冲刺中无敌', () => {
    for (const [id, lunge] of [
      ['swordfish_spear', WEAPONS.swordfish_spear.melee.lunge],
      ['shark_katana', WEAPONS.shark_katana.melee.lunge],
    ] as const) {
      const t = setup();
      const player = t.player(60, 100, id, false);
      t.step(1);
      t.input.fire = true;
      t.step(1);
      t.input.fire = false;
      let invulnerable = false;
      t.step(Math.ceil(WEAPONS[id].melee.duration / DT) + 1, () => {
        invulnerable ||= t.world.getActor(player)!.invulnerable;
      });
      // 挥动结束后惯性很快停下
      t.step(30);
      const moved = t.world.getActor(player)!.x - 60;
      expect(moved).toBeGreaterThan(lunge * 0.9);
      expect(moved).toBeLessThan(lunge * 1.4);
      expect(invulnerable).toBe(id === 'shark_katana');
    }
  });
});

describe('存档', () => {
  it('弹体在飞、蓄力与冰冻进行中存档，恢复后继续的结果逐项一致', () => {
    const t = setup([{ x: 200, y: 20, w: 20, h: 40 }]);
    t.player(100, 100, 'jelly_guard');
    t.enemy('naiwa_tank', 180, 100);
    t.enemy('naiwa_chaser', 60, 160, false);
    t.step(WARMUP);
    // 换武器保留冷却（ADR 0008），每把先松手等冷却结束再开火。
    const fire = (weapon: WeaponId, frames: number, aim = { x: 1, y: 0 }) => {
      t.world.equipWeapon(weapon);
      t.input.aim = aim;
      t.step(45);
      t.input.fire = true;
      t.step(frames);
      t.input.fire = false;
    };
    fire('jelly_guard', 90);
    fire('urchin_mortar', 2, { x: -1, y: 0 });
    fire('bubble_bouncer', 2, { x: 1, y: -1 });
    // 自瞄会攻击当前敌人；冰冻检查使用随后生成的新目标，避免先前攻击已将它击杀。
    fire('puffer_wand', 2, { x: -1, y: 1 });
    fire('fin_boomerang', 2, { x: 0, y: 1 });
    const target = t.enemy('naiwa_tank', 100, 70);
    fire('slush_blaster', 12);
    t.world.equipWeapon('coral_bow');
    t.input.fire = true;
    t.step(20);
    expect(t.active().length).toBeGreaterThan(4);
    expect(t.world.charge).toBeGreaterThan(0);
    expect(t.world.getActor(target)!.chill).toBeGreaterThan(0);

    const saved = JSON.parse(JSON.stringify(t.world.save())) as ReturnType<CombatWorld['save']>;
    const copy = setup([{ x: 200, y: 20, w: 20, h: 40 }]);
    copy.world.load(saved);
    for (const [id, p] of t.pins) copy.pins.set(id, p);
    copy.input.aim = { ...t.input.aim! };
    copy.input.fire = true;
    expect(copy.world.save()).toEqual(t.world.save());
    for (const run of [t, copy]) {
      run.step(30);
      run.input.fire = false;
      run.step(90);
    }
    expect(copy.world.save()).toEqual(t.world.save());
  });

  it('弹体池前面有空槽时存档，分裂出的小弹落在原来的槽位，恢复后继续一致（GPT 复现的场景）', () => {
    const bus = new EventBus<GameEvents>();
    const world = createCombatWorld({ seed: 17, bus });
    world.spawnPlayer('ai_proto', 50, 100);
    const input = createInputFrame();
    input.aim = { x: 1, y: 0 };
    const run = (w: CombatWorld, n: number) => {
      for (let i = 0; i < n; i++) for (const b of w.step(DT, input).bulletSpawns) w.releaseBullet(b.id);
    };
    world.takeWeapon('octo_bazooka');
    input.fire = true;
    run(world, 1);
    input.fire = false;
    run(world, 68);
    world.takeWeapon('urchin_mortar');
    input.fire = true;
    run(world, 1);
    input.fire = false;
    run(world, 29);
    // 火箭已经到期，槽位 0 空着，榴弹还在槽位 1。
    expect(world.shots[0]!.active).toBe(false);
    expect(world.shots[1]!.active).toBe(true);
    const copy = createCombatWorld({ seed: 17, bus: new EventBus<GameEvents>() });
    copy.load(JSON.parse(JSON.stringify(world.save())) as ReturnType<CombatWorld['save']>);
    expect(copy.shots.map((s) => s.active)).toEqual(world.shots.map((s) => s.active));
    expect(copy.save()).toEqual(world.save());
    run(world, 8);
    run(copy, 8);
    expect(copy.save()).toEqual(world.save());
  });

  it('区域池前面有空槽时存档，恢复到原来的槽位（ADR 0030 的毒气同理）', () => {
    const t = setup();
    t.player(150, 100, 'pistol_basic');
    t.enemy('naiwa_gasser', 60, 60, false);
    // 放屁蛙每 1.4 秒放一团持续 3.5 秒的毒气：第一团消失时后面几团还在。
    let gap = false;
    for (let i = 0; i < 600 && !gap; i++) {
      t.step(1);
      const z = t.world.zones;
      gap = !z[0]!.active && z.slice(1).some((x) => x.active);
    }
    expect(gap).toBe(true);
    const copy = setup();
    copy.world.load(JSON.parse(JSON.stringify(t.world.save())) as ReturnType<CombatWorld['save']>);
    for (const [id, p] of t.pins) copy.pins.set(id, p);
    copy.input.aim = { ...t.input.aim! };
    expect(copy.world.zones.map((z) => z.active)).toEqual(t.world.zones.map((z) => z.active));
    t.step(240);
    copy.step(240);
    expect(copy.world.save()).toEqual(t.world.save());
  });
});
