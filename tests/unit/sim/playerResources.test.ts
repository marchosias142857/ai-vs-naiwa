import { expect, it } from 'vitest';
import { PLAYER_RULES, UPGRADES, type UpgradeId } from '../../../src/data/player';
import { PlayerRulesSchema, UpgradeDefSchema } from '../../../src/data/schema/player';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';
import { PlayerResources } from '../../../src/sim/stats/PlayerResources';

it('数据合法；不同物理步长下护甲延迟与修复量一致', () => {
  expect(PlayerRulesSchema.safeParse(PLAYER_RULES).success).toBe(true);
  for (const d of Object.values(UPGRADES)) expect(UpgradeDefSchema.safeParse(d).success).toBe(true);
  for (const fps of [60, 120]) {
    const r = new PlayerResources(PLAYER_RULES);
    expect(r.absorb(7)).toBe(2);
    expect(r.armor).toBe(0);
    for (let i = 0; i < 3 * fps; i++) r.step(1 / fps);
    expect(r.armor).toBe(0);
    for (let i = 0; i < 2 * fps + 1; i++) r.step(1 / fps);
    expect(r.armor).toBe(2);
  }
});
it('护甲优先，技能边沿只触发一次，切枪保留免费手枪', () => {
  const w = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>(), playerRules: PLAYER_RULES });
  const p = w.spawnPlayer('ai_proto', 100, 100),
    e = w.spawnEnemy('naiwa_chaser', 100, 100),
    input = createInputFrame();
  for (let i = 0; i < 40; i++) w.step(1 / 60, input);
  w.contact(e, p);
  expect(w.getActor(p)!.hp).toBe(6);
  expect(w.resources.armor).toBe(4);
  input.skillPressed = true;
  w.step(1 / 60, input);
  expect(w.resources.skillRemaining).toBe(PLAYER_RULES.skillCooldown);
  input.skillPressed = false;
  w.step(1 / 60, input);
  expect(w.resources.skillRemaining).toBeLessThan(PLAYER_RULES.skillCooldown);
  w.takeWeapon('shotgun_fan');
  expect(w.weaponId).toBe('shotgun_fan');
  input.swapPressed = true;
  w.step(1 / 60, input);
  expect(w.weaponId).toBe('pistol_basic');
  w.step(1 / 60, input);
  expect(w.weaponId).toBe('shotgun_fan');
});
it('没有实际弹丸不扣能量；能量耗尽仍可用免费手枪', () => {
  const w = createCombatWorld({
    seed: 1,
    bus: new EventBus<GameEvents>(),
    maxBullets: 1,
    playerRules: { ...PLAYER_RULES, energy: 1 },
  });
  w.spawnPlayer('ai_proto', 0, 0);
  w.equipWeapon('rifle_auto');
  const input = createInputFrame();
  input.fire = true;
  const id = w.step(1 / 60, input).bulletSpawns[0]!.id;
  expect(w.resources.energy).toBe(0);
  for (let i = 0; i < 30; i++) expect(w.step(1 / 60, input).bulletSpawns).toHaveLength(0);
  w.releaseBullet(id);
  w.equipWeapon('pistol_basic');
  let n = 0;
  for (let i = 0; i < 30; i++) n += w.step(1 / 60, input).bulletSpawns.length;
  expect(n).toBe(1);
});
it('八种升级均生效，补给不能超上限', () => {
  const w = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>(), playerRules: PLAYER_RULES });
  const p = w.spawnPlayer('ai_proto', 0, 0);
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) expect(w.upgrade(id)).toBe(true);
  expect(w.resources.damageScale).toBeGreaterThan(1);
  expect(w.resources.fireRateScale).toBeGreaterThan(1);
  expect(w.resources.maxArmor).toBe(7);
  expect(w.resources.maxEnergy).toBe(250);
  expect(w.getActor(p)!.maxHp).toBe(8);
  expect(w.grantPickup('health', 10)).toBe(false);
  expect(w.grantPickup('energy', 100)).toBe(false);
  expect(w.grantPickup('coin', 3)).toBe(true);
  expect(w.resources.coins).toBe(3);
  expect(w.grantPickup('coin', NaN)).toBe(false);
});

it('补给原子扣款，余额不足与满额时不吞金币', () => {
  const world = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>(), playerRules: PLAYER_RULES });
  const id = world.spawnPlayer('ai_proto', 0, 0);
  world.restorePlayer({ hp: 2, armor: 5, energy: 0, coins: 7 });
  expect(world.buySupplies()).toBe(false);
  expect(world.resources.coins).toBe(7);
  world.grantPickup('coin', 1);
  expect(world.buySupplies()).toBe(true);
  expect(world.resources.coins).toBe(0);
  expect(world.getActor(id)!.hp).toBe(4);
  expect(world.resources.energy).toBe(50);
  world.grantPickup('health', 100);
  world.grantPickup('energy', 1000);
  world.grantPickup('coin', 8);
  expect(world.buySupplies()).toBe(false);
  expect(world.resources.coins).toBe(8);
});

it('开局只有手枪，空槽切枪无效；首次拾取后才可切换，手枪不进入第二槽', () => {
  const world = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>() }),
    input = createInputFrame();
  world.spawnPlayer('ai_proto', 0, 0);
  expect(world.secondaryWeapon).toBeNull();
  input.swapPressed = true;
  world.step(1 / 60, input);
  expect(world.weaponId).toBe('pistol_basic');
  expect(world.takeWeapon('pistol_basic')).toBe(false);
  expect(world.takeWeapon('rifle_auto')).toBe(true);
  world.step(1 / 60, input);
  expect(world.weaponId).toBe('pistol_basic');
  world.step(1 / 60, input);
  expect(world.weaponId).toBe('rifle_auto');
});
