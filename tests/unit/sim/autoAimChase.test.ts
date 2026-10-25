import { describe, expect, it } from 'vitest';
import { chaseVelocity } from '../../../src/sim/ai/chase';
import type { ActorView } from '../../../src/sim/combat/api';
import { AutoAim } from '../../../src/sim/combat/autoAim';

let nextId = 1;
function actor(
  team: 'player' | 'enemy',
  x: number,
  y: number,
  phase: ActorView['phase'] = 'active',
): ActorView {
  return {
    id: nextId++,
    team,
    kind: team === 'player' ? 'ai_proto' : 'naiwa_chaser',
    phase,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 6,
    hp: 9,
    maxHp: 9,
    invulnerable: false,
    facing: 0,
    pose: 'idle',
    lift: 0,
    aim: 0,
    move: 'none',
  };
}
const visible = () => true;

describe('AutoAim', () => {
  it('选射程内最近的敌人，忽略己方、射程外、预警中与已死亡的实体', () => {
    const near = actor('enemy', 50, 0);
    const actors = [
      actor('player', 10, 0),
      actor('enemy', 300, 0),
      actor('enemy', 20, 0, 'telegraph'),
      actor('enemy', 15, 0, 'dead'),
      near,
      actor('enemy', 80, 0),
    ];
    const aim = new AutoAim(0.25, visible);
    expect(aim.update('player', 0, 0, 220, actors, 0)?.id).toBe(near.id);
  });

  it('视线被挡住的敌人不会被选中', () => {
    const hidden = actor('enemy', 30, 0);
    const shown = actor('enemy', 100, 0);
    const aim = new AutoAim(0.25, (_x1, _y1, x2) => x2 !== 30);
    expect(aim.update('player', 0, 0, 220, [hidden, shown], 0)?.id).toBe(shown.id);
  });

  it('当前目标有效时，至少保持 retargetInterval 才切换到更近的敌人', () => {
    const first = actor('enemy', 100, 0);
    const actors: ActorView[] = [first];
    const aim = new AutoAim(0.25, visible);
    expect(aim.update('player', 0, 0, 220, actors, 0)?.id).toBe(first.id);
    const closer = actor('enemy', 20, 0);
    actors.push(closer);
    expect(aim.update('player', 0, 0, 220, actors, 0.1)?.id).toBe(first.id);
    expect(aim.update('player', 0, 0, 220, actors, 0.3)?.id).toBe(closer.id);
  });

  it('目标失效时立刻重新选择', () => {
    const a = { ...actor('enemy', 50, 0) };
    const b = actor('enemy', 90, 0);
    const aim = new AutoAim(10, visible);
    expect(aim.update('player', 0, 0, 220, [a, b], 0)?.id).toBe(a.id);
    const deadA = { ...a, phase: 'dead' as const };
    expect(aim.update('player', 0, 0, 220, [deadA, b], 0.01)?.id).toBe(b.id);
  });

  it('没有目标时返回 null', () => {
    expect(new AutoAim(0.25, visible).update('player', 0, 0, 220, [], 0)).toBeNull();
  });
});

describe('chaseVelocity', () => {
  it('以 speed 朝目标移动', () => {
    const self = actor('enemy', 0, 0);
    const out = chaseVelocity({ x: 0, y: 0 }, self, { x: 100, y: 0 }, [self], 45, 14);
    expect(out.x).toBeCloseTo(45, 9);
    expect(out.y).toBeCloseTo(0, 9);
  });

  it('贴住目标（半径之内）时不再往里挤', () => {
    const self = actor('enemy', 0, 0);
    expect(chaseVelocity({ x: 1, y: 1 }, self, { x: 3, y: 0 }, [self], 45, 14)).toEqual({ x: 0, y: 0 });
  });

  it('同伴太近时被推开，且速度不超过 speed', () => {
    const a = actor('enemy', 0, 0);
    const b = actor('enemy', 4, 0);
    const out = chaseVelocity({ x: 0, y: 0 }, a, null, [a, b], 45, 14);
    expect(out.x).toBeLessThan(0);
    expect(Math.hypot(out.x, out.y)).toBeLessThanOrEqual(45 + 1e-9);
  });

  it('完全重合的两只怪朝相反方向分开', () => {
    const a = actor('enemy', 10, 10);
    const b = actor('enemy', 10, 10);
    const va = chaseVelocity({ x: 0, y: 0 }, a, null, [a, b], 45, 14);
    const vb = chaseVelocity({ x: 0, y: 0 }, b, null, [a, b], 45, 14);
    expect(Math.sign(va.x)).toBe(-Math.sign(vb.x));
    expect(va.x).not.toBe(0);
  });

  it('不受其他阵营与非活动实体影响', () => {
    const self = actor('enemy', 0, 0);
    const others = [self, actor('player', 2, 0), actor('enemy', 2, 0, 'telegraph')];
    expect(chaseVelocity({ x: 0, y: 0 }, self, null, others, 45, 14)).toEqual({ x: 0, y: 0 });
  });
});
