import { describe, expect, it } from 'vitest';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';

describe('CombatWorld 接口（ADR 0003）', () => {
  it('实现合并前，createCombatWorld 明确报错而不是静默返回', () => {
    expect(() => createCombatWorld({ seed: 1, bus: new EventBus<GameEvents>() })).toThrow(/#13/);
  });
});
