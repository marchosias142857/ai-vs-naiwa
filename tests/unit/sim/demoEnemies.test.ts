import { expect, it } from 'vitest';
import { ATTACKS } from '../../../src/data/attacks';
import { ENEMIES } from '../../../src/data/enemies';
import { WeaponDefSchema } from '../../../src/data/schema';
import type { EnemyDef } from '../../../src/data/schema';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';

it('六种普通敌人 + Boss 的攻击引用完整、攻击符合武器 schema', () => {
  expect(Object.keys(ENEMIES)).toHaveLength(7);
  for (const def of Object.values(ATTACKS)) expect(WeaponDefSchema.safeParse(def).success).toBe(true);
  for (const def of Object.values(ENEMIES) as EnemyDef[]) {
    if (def.attack) expect(def.attack in ATTACKS).toBe(true);
    for (const p of def.phases ?? []) expect(p.attack in ATTACKS).toBe(true);
  }
});
it('godMode：真实敌方生成的子弹只发非暴击 hit、回收，不扣血或触发无敌帧', () => {
  const bus = new EventBus<GameEvents>(),
    w = createCombatWorld({ seed: 5, bus, godMode: true });
  const player = w.spawnPlayer('ai_proto', 100, 100);
  w.spawnEnemy('naiwa_spitter', 200, 100);
  const log: string[] = [];
  bus.on('entity:damaged', () => log.push('damage'));
  bus.on('bullet:hit', (e) => log.push(`hit:${e.critical}`));
  const input = createInputFrame();
  let hits = 0;
  for (let i = 0; i < 180; i++)
    for (const b of w.step(1 / 60, input).bulletSpawns) {
      expect(b.team).toBe('enemy');
      expect(w.hitActor(b.id, player, 100, 100)).toBe(true);
      hits++;
    }
  expect(hits).toBeGreaterThan(0);
  expect(log).toEqual(Array(hits).fill('hit:false'));
  expect(w.getActor(player)!.hp).toBe(w.getActor(player)!.maxHp);
  expect(w.getActor(player)!.invulnerable).toBe(false);
});
it('墙遮挡时不射击；冲锋先蓄力，方向锁定后高速移动', () => {
  const w = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>(), lineOfSight: () => false });
  const p = w.spawnPlayer('ai_proto', 100, 100);
  w.spawnEnemy('naiwa_turret', 200, 100);
  const charger = w.spawnEnemy('naiwa_charger', 220, 100),
    input = createInputFrame();
  let warning = false,
    dashed = false;
  for (let i = 0; i < 160; i++) {
    expect(w.step(1 / 60, input).bulletSpawns).toHaveLength(0);
    const a = w.getActor(charger)!;
    warning ||= !!a.warning;
    if (a.vx < -100) {
      dashed = true;
      w.syncPosition(p, 100, 200);
      expect(a.vy).toBe(0);
      break;
    }
  }
  expect(warning).toBe(true);
  expect(dashed).toBe(true);
});
it('Boss 70% / 40% 血线会切换到 12 / 16 颗环形弹幕', () => {
  const w = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>(), godMode: true });
  w.spawnPlayer('ai_proto', 100, 100);
  const boss = w.spawnEnemy('naiwa_boss', 200, 100);
  w.equipWeapon('sniper_pierce');
  const input = createInputFrame();
  input.fire = true;
  input.aim = { x: 1, y: 0 };
  const counts = new Set<number>();
  for (let i = 0; i < 1800; i++) {
    const result = w.step(1 / 60, input);
    let enemy = 0;
    for (const b of result.bulletSpawns) {
      if (b.team === 'player') w.hitActor(b.id, boss, 200, 100);
      else enemy++;
      w.releaseBullet(b.id);
    }
    if (enemy) counts.add(enemy);
    if (w.getActor(boss)!.hp / w.getActor(boss)!.maxHp < 0.35) input.fire = false;
  }
  expect(counts.has(5)).toBe(true);
  expect(counts.has(12)).toBe(true);
  expect(counts.has(16)).toBe(true);
});
