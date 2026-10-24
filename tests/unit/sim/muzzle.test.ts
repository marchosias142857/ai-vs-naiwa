import { describe, it, expect } from 'vitest';
import { HERO_ART, WEAPON_ART } from '../../../src/data/art';
import { WEAPONS, type WeaponId } from '../../../src/data/weapons';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';
import { playerMuzzle } from '../../../src/sim/weapons/muzzle';

describe('标准持握枪口与身体圆心', () => {
  it('所有武器水平左右镜像：枪口高度不倒置，和动画帧无关', () => {
    const a = { x: 0, y: 0 },
      b = { x: 0, y: 0 };
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      playerMuzzle(a, 100, 80, 0, id);
      playerMuzzle(b, 100, 80, Math.PI, id);
      const art = WEAPON_ART[id];
      expect(a.x).toBeCloseTo(100 + HERO_ART.standardGrip.x + art.muzzle.x * art.scale);
      expect(a.y).toBeCloseTo(80 + HERO_ART.standardGrip.y + art.muzzle.y * art.scale);
      expect(b.x).toBeCloseTo(200 - a.x);
      expect(b.y).toBeCloseTo(a.y);
    }
  });
  it('向上/斜向射击出生坐标来自固定点；近墙回退到身体，不跨墙', () => {
    for (const angle of [-Math.PI / 2, Math.PI / 4, Math.PI * 0.75, Math.PI / 2]) {
      for (const blocked of [false, true]) {
        const world = createCombatWorld({
          seed: 1,
          bus: new EventBus<GameEvents>(),
          lineOfSight: () => !blocked,
        });
        world.spawnPlayer('ai_proto', 100, 80);
        const input = createInputFrame();
        input.aim = { x: Math.cos(angle), y: Math.sin(angle) };
        input.fire = true;
        const bullet = world.step(1 / 60, input).bulletSpawns[0]!;
        const point = { x: 100, y: 80 };
        if (!blocked) playerMuzzle(point, 100, 80, angle, 'pistol_basic');
        expect(bullet.x).toBeCloseTo(point.x);
        expect(bullet.y).toBeCloseTo(point.y);
      }
    }
  });
  it('射手瞄准双方身体中心，同高时无旧半径偏角', () => {
    const world = createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>() });
    world.spawnPlayer('ai_proto', 100, 80);
    const id = world.spawnEnemy('naiwa_turret', 200, 80);
    for (let i = 0; i < 120; i++) world.step(1 / 60, createInputFrame());
    expect(Math.abs(world.getActor(id)!.facing)).toBe(Math.PI);
  });
});
