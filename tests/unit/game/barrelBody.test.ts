import { describe, expect, it } from 'vitest';
import { TRAP_RULES } from '../../../src/data/traps';
import { newBarrelBody, syncBarrelBody } from '../../../src/game/fx/barrelBody';
import { TRAP_FX } from '../../../src/game/fx/trapParams';
import { createCombatWorld, type TrapLayoutInput } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';

const barrel = (x: number, y: number): TrapLayoutInput => ({
  kind: 'barrel',
  x,
  y,
  width: 0,
  height: 0,
  radius: TRAP_RULES.barrel.radius,
  angle: 0,
  delay: 0,
});

describe('鱼雷桶碰撞体同步（ADR 0032）', () => {
  it('连续换房时同一槽位都是立着的桶，碰撞体挪到新桶的位置（GPT 复现：第 2 层房间 1→2）', () => {
    const world = createCombatWorld({ seed: 11, bus: new EventBus<GameEvents>() });
    const bodies = [newBarrelBody(), newBarrelBody(), newBarrelBody()];
    const sync = () => bodies.map((b, i) => syncBarrelBody(b, world.traps[i], TRAP_FX.barrelBody));
    world.setTraps(51, [barrel(60, 60), barrel(200, 73), barrel(280, 197)]);
    expect(sync()).toEqual(['place', 'place', 'place']);
    expect(sync()).toEqual(['keep', 'keep', 'keep']);
    world.setTraps(52, [barrel(60, 60), barrel(330, 73), barrel(234, 143)]);
    expect(sync()).toEqual(['keep', 'place', 'place']);
    for (let i = 0; i < bodies.length; i++) {
      const t = world.traps[i]!;
      expect(bodies[i]).toEqual({ on: true, x: t.x, y: t.y, size: t.radius * TRAP_FX.barrelBody });
    }
  });

  it('桶爆掉或换到没有桶的房间就关掉碰撞体，之后不重复关', () => {
    const world = createCombatWorld({ seed: 11, bus: new EventBus<GameEvents>() });
    const body = newBarrelBody();
    world.setTraps(1, [barrel(100, 100)]);
    expect(syncBarrelBody(body, world.traps[0], TRAP_FX.barrelBody)).toBe('place');
    world.setTraps(2, [{ ...barrel(100, 100), kind: 'mine', radius: TRAP_RULES.mine.radius }]);
    expect(syncBarrelBody(body, world.traps[0], TRAP_FX.barrelBody)).toBe('remove');
    expect(syncBarrelBody(body, world.traps[0], TRAP_FX.barrelBody)).toBe('keep');
    world.setTraps(3, []);
    expect(syncBarrelBody(body, world.traps[0], TRAP_FX.barrelBody)).toBe('keep');
    expect(body.on).toBe(false);
  });
});
