import { describe, expect, it, vi } from 'vitest';
import { RESUME_RULES } from '../../../src/data/resume';
import { ResumeRulesSchema } from '../../../src/data/schema/resume';
import { PauseState } from '../../../src/game/world/PauseState';

describe('恢复暂停原因', () => {
  it('参数符合 schema；倒计时只释放自己的原因', () => {
    expect(ResumeRulesSchema.parse(RESUME_RULES)).toEqual(RESUME_RULES);
    let now = 0;
    const changed = vi.fn();
    const p = new PauseState(3, changed, () => now);
    p.set('upgrade', true);
    p.set('restore', true);
    now = 9000;
    p.update();
    expect(p.remaining).toBe(3);
    p.set('restore', false);
    expect(p.blocked).toBe(true);
    expect(p.has('upgrade')).toBe(true);
    p.set('upgrade', false);
    expect(p.blocked).toBe(false);
    expect(changed).toHaveBeenCalledTimes(4);
  });
  it.each(['manual', 'lifecycle'] as const)('%s 中断后立即重新开始完整 3 秒', (reason) => {
    let now = 0;
    const changed = vi.fn();
    const p = new PauseState(3, changed, () => now);
    p.set('restore', true);
    now = 1000;
    p.update();
    expect(p.remaining).toBe(2);
    p.set(reason, true);
    now = 100000;
    p.update();
    expect(p.remaining).toBe(3);
    p.set(reason, false);
    expect(p.remaining).toBe(3);
    now += 2999;
    p.update();
    expect(p.blocked).toBe(true);
    now++;
    p.update();
    expect(p.blocked).toBe(false);
    expect(changed).toHaveBeenLastCalledWith('restore', false);
  });
  it('手动和自动暂停重叠，最后一个原因解除后才能倒计时', () => {
    let now = 0;
    const p = new PauseState(
      3,
      () => {},
      () => now,
    );
    p.set('restore', true);
    p.set('manual', true);
    p.set('lifecycle', true);
    p.set('lifecycle', false);
    now = 10000;
    p.update();
    expect(p.remaining).toBe(3);
    p.set('manual', false);
    now += 2000;
    p.update();
    expect(p.remaining).toBe(1);
  });
});
