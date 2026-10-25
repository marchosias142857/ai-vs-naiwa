import { describe, expect, it } from 'vitest';
import { ENEMIES, type EnemyId } from '../../../src/data/enemies';
import { BALANCE } from '../../../src/data/balance';
import { createCombatWorld, type CombatWorld, type CombatWorldOptions } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import type { GameEvents } from '../../../src/sim/core/events';
import { createInputFrame } from '../../../src/sim/core/types';

/**
 * ADR 0029 怪物招式。用最小的「物理」代替 Arcade：按速度积分位置、限制在房间内、可选方块障碍挡住移动；
 * 子弹生成后立即回收（需要时由用例自己统计）。
 */
const DT = 1 / 60;
const BOUNDS = { x: 0, y: 0, width: 300, height: 200 };
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function blocked(boxes: readonly Box[], x: number, y: number, r: number): boolean {
  if (
    x - r < BOUNDS.x ||
    y - r < BOUNDS.y ||
    x + r > BOUNDS.x + BOUNDS.width ||
    y + r > BOUNDS.y + BOUNDS.height
  )
    return true;
  return boxes.some((b) => x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h);
}

function setup(seed = 3, boxes: Box[] = [], extra: Partial<CombatWorldOptions> = {}) {
  const bus = new EventBus<GameEvents>();
  const world = createCombatWorld({ seed, bus, bounds: BOUNDS, ...extra });
  const log: string[] = [];
  bus.on('enemy:acted', (e) => log.push(e.action));
  bus.on('combat:exploded', () => log.push('exploded'));
  const input = createInputFrame();
  let bullets = 0;
  const step = (n = 1, hold?: (w: CombatWorld) => void) => {
    for (let i = 0; i < n; i++) {
      for (const a of world.actors) {
        if (a.phase !== 'active') continue;
        const nx = a.x + a.vx * DT,
          ny = a.y + a.vy * DT;
        // 撞上障碍就停在原地，对应 Arcade 的分离。
        if (!blocked(boxes, nx, ny, a.radius)) world.syncPosition(a.id, nx, ny);
      }
      hold?.(world);
      for (const b of world.step(DT, input).bulletSpawns) {
        if (b.team === 'enemy') bullets++;
        world.releaseBullet(b.id);
      }
    }
  };
  return { world, bus, log, input, step, bullets: () => bullets };
}

const pin = (id: number, x: number, y: number) => (w: CombatWorld) => w.syncPosition(id, x, y);

describe('弹簧蛙跳跃', () => {
  it('蓄力后腾空飞向玩家，空中有高度且不造成接触伤害，落地放一圈子弹', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 150, 100);
    const hopper = t.world.spawnEnemy('naiwa_hopper', 90, 100);
    let lifted = 0,
      contactDuringAir = false;
    for (let i = 0; i < 200; i++) {
      t.step(1, pin(player, 150, 100));
      const h = t.world.getActor(hopper)!;
      if (h.pose === 'air') {
        lifted = Math.max(lifted, h.lift);
        const before = t.world.getActor(player)!.hp;
        t.world.contact(hopper, player);
        contactDuringAir ||= t.world.getActor(player)!.hp < before;
      }
    }
    expect(lifted).toBeGreaterThan(ENEMIES.naiwa_hopper.hop.height * 0.9);
    expect(contactDuringAir).toBe(false);
    expect(t.log).toContain('hop');
    expect(t.log).toContain('land');
    expect(t.bullets()).toBeGreaterThanOrEqual(6);
    // 跳了 60 像素，落在玩家附近
    expect(Math.abs(t.world.getActor(hopper)!.x - 150)).toBeLessThan(20);
  });
});

describe('大头蛙扑咬', () => {
  it('远处追击，进入 trigger 后才蓄力，再以冲刺速度扑出', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 200, 100);
    const chaser = t.world.spawnEnemy('naiwa_chaser', 60, 100);
    const trigger = ENEMIES.naiwa_chaser.dash.trigger;
    let sawWindupFar = false,
      lunged = false;
    for (let i = 0; i < 400 && !lunged; i++) {
      t.step(1, pin(player, 200, 100));
      const c = t.world.getActor(chaser)!;
      if (c.pose === 'windup' && 200 - c.x > trigger + 2) sawWindupFar = true;
      if (Math.hypot(c.vx, c.vy) > ENEMIES.naiwa_chaser.dash.speed * 0.95) lunged = true;
    }
    expect(sawWindupFar).toBe(false);
    expect(lunged).toBe(true);
    expect(t.log).toContain('lunge');
  });
});

describe('炸弹蛙', () => {
  it('靠近后鼓胀引信，时间到爆炸伤害范围内的玩家并结束自己', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 150, 100);
    const bomber = t.world.spawnEnemy('naiwa_bomber', 100, 100);
    const hp = t.world.getActor(player)!.hp;
    for (let i = 0; i < 240; i++) t.step(1, pin(player, 150, 100));
    expect(t.log).toContain('explode');
    expect(t.log).toContain('exploded');
    expect(t.world.getActor(bomber)?.phase ?? 'dead').toBe('dead');
    expect(t.world.getActor(player)!.hp).toBeLessThan(hp);
  });
  it('引信点燃前打死就不会爆炸', () => {
    const t = setup();
    t.world.spawnPlayer('ai_proto', 250, 100);
    const bomber = t.world.spawnEnemy('naiwa_bomber', 50, 100);
    t.step(40);
    t.world.debugKillEnemies();
    t.step(120);
    expect(t.world.getActor(bomber)?.phase ?? 'dead').toBe('dead');
    expect(t.log).not.toContain('explode');
  });
});

describe('舌头蛙', () => {
  it('蓄力瞄准后出舌，打中线上的玩家并把玩家拉近', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 160, 100);
    t.world.spawnEnemy('naiwa_tongue', 100, 100);
    const hp = t.world.getActor(player)!.hp;
    let pulled = false;
    for (let i = 0; i < 180; i++) {
      t.step(1);
      // 玩家不动，拉近表现为玩家速度朝向舌头蛙
      if (t.world.getActor(player)!.vx < -1) pulled = true;
    }
    expect(t.log).toContain('lash');
    expect(t.world.getActor(player)!.hp).toBeLessThan(hp);
    expect(pulled).toBe(true);
  });
  it('出舌前一刻横移离开预警线就能躲开', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 160, 100);
    const tongue = t.world.spawnEnemy('naiwa_tongue', 100, 100);
    const hp = t.world.getActor(player)!.hp;
    let dodgeY = 100;
    for (let i = 0; i < 180; i++) {
      t.step(1, pin(player, 160, dodgeY));
      const a = t.world.getActor(tongue)!;
      if (a.pose === 'windup' && dodgeY === 100 && a.warning) {
        // 等到方向锁定（出舌前 0.25 秒内）再躲
        t.step(Math.round((ENEMIES.naiwa_tongue.lash.windup - 0.2) / DT), pin(player, 160, 100));
        dodgeY = 140;
      }
    }
    expect(t.log).toContain('lash');
    expect(t.world.getActor(player)!.hp).toBe(hp);
  });
});

describe('召唤与分裂', () => {
  it('蛙卵团按间隔召唤蝌蚪，子嗣不超过上限', () => {
    const t = setup();
    t.world.spawnPlayer('ai_proto', 280, 100);
    const brood = t.world.spawnEnemy('naiwa_brood', 60, 100);
    let most = 0;
    for (let i = 0; i < 60 * 20; i++) {
      t.step();
      const kids = t.world.actors.filter((a) => a.kind === 'naiwa_tadpole' && a.phase !== 'dead').length;
      most = Math.max(most, kids);
    }
    expect(most).toBe(ENEMIES.naiwa_brood.summon.max);
    expect(t.world.getActor(brood)!.phase).toBe('active');
  });
  it('叠罗汉蛙死亡时分裂成三只蝌蚪；蝌蚪不掉落', () => {
    const t = setup();
    t.world.spawnPlayer('ai_proto', 280, 100);
    t.world.spawnEnemy('naiwa_splitter', 60, 100);
    t.step(60);
    t.world.debugKillEnemies();
    const kids = t.world.actors.filter((a) => a.kind === 'naiwa_tadpole');
    expect(kids).toHaveLength(ENEMIES.naiwa_splitter.split.count);
    expect(t.log).toContain('split');
    expect(ENEMIES.naiwa_tadpole.loot).toBe(0);
  });
});

describe('地洞蛙', () => {
  it('在地下时子弹穿过、没有接触伤害；冒头后放一圈子弹', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 200, 100);
    const mole = t.world.spawnEnemy('naiwa_burrower', 60, 100);
    t.step(Math.ceil(BALANCE.spawnTelegraph / DT) + 2, pin(player, 200, 100));
    const a = t.world.getActor(mole)!;
    expect(a.pose).toBe('buried');
    const hp = t.world.getActor(player)!.hp;
    t.world.contact(mole, player);
    expect(t.world.getActor(player)!.hp).toBe(hp);
    t.world.equipWeapon('pistol_basic');
    t.input.fire = true;
    t.input.aim = { x: 1, y: 0 };
    const spawn = t.world.step(DT, t.input).bulletSpawns.find((b) => b.team === 'player')!;
    t.input.fire = false;
    expect(t.world.hitActor(spawn.id, mole, a.x, a.y)).toBe(false);
    t.world.releaseBullet(spawn.id);
    for (let i = 0; i < 240; i++) t.step(1, pin(player, 200, 100));
    expect(t.log).toContain('emerge');
    expect(t.bullets()).toBeGreaterThanOrEqual(8);
  });
});

describe('街舞蛙与放屁蛙', () => {
  it('旋转时朝不断转动的方向连续开火', () => {
    const t = setup();
    t.world.spawnPlayer('ai_proto', 200, 100);
    t.world.spawnEnemy('naiwa_dancer', 110, 100);
    const angles: number[] = [];
    t.bus.on('weapon:fired', (e) => angles.push(e.angle));
    t.step(60 * 6);
    expect(t.log).toContain('spin');
    expect(angles.length).toBeGreaterThan(5);
    expect(new Set(angles.map((a) => a.toFixed(3))).size).toBeGreaterThan(5);
  });
  it('毒气云按间隔伤害站在里面的玩家', () => {
    const t = setup();
    const player = t.world.spawnPlayer('ai_proto', 150, 100);
    const gasser = t.world.spawnEnemy('naiwa_gasser', 140, 100);
    const hp = t.world.getActor(player)!.hp;
    for (let i = 0; i < 60 * 4; i++) {
      t.step(1, pin(player, 150, 100));
      t.world.syncPosition(gasser, 140, 100);
    }
    expect(t.world.zones.some((z) => z.active && z.kind === 'poison')).toBe(true);
    expect(t.world.getActor(player)!.hp).toBeLessThan(hp);
  });
});

describe('Boss 奶怪', () => {
  const findBump = (t: ReturnType<typeof setup>, boss: number, player: number, px: number, py: number) => {
    for (let i = 0; i < 60 * 12; i++) {
      t.step(1, pin(player, px, py));
      if (t.log.includes('lunge')) return t.world.getActor(boss)!;
    }
    throw new Error('没有冲撞');
  };
  it('冲撞撞上石柱会眩晕，眩晕时受到加成伤害', () => {
    // 石柱挡在 Boss 与玩家之间
    const t = setup(5, [{ x: 140, y: 80, w: 20, h: 40 }]);
    const player = t.world.spawnPlayer('ai_proto', 230, 100);
    const boss = t.world.spawnEnemy('naiwa_boss', 60, 100);
    findBump(t, boss, player, 230, 100);
    for (let i = 0; i < 90 && !t.log.includes('stun'); i++) t.step(1, pin(player, 230, 100));
    expect(t.log).toContain('stun');
    const a = t.world.getActor(boss)!;
    expect(a.pose).toBe('recover');
    const damages: number[] = [];
    t.bus.on('entity:damaged', (e) => e.id === boss && damages.push(e.amount));
    t.world.equipWeapon('pistol_basic');
    t.input.fire = true;
    t.input.aim = { x: -1, y: 0 };
    const shot = t.world.step(DT, t.input).bulletSpawns.find((b) => b.team === 'player')!;
    t.input.fire = false;
    t.world.hitActor(shot.id, boss, a.x, a.y);
    expect(damages[0]).toBeCloseTo(3 * ENEMIES.naiwa_boss.bump.bonus, 5);
  });
  it('冲到房间边墙只是停下，不会眩晕', () => {
    const t = setup(5);
    const player = t.world.spawnPlayer('ai_proto', 285, 100);
    const boss = t.world.spawnEnemy('naiwa_boss', 150, 100);
    findBump(t, boss, player, 285, 100);
    for (let i = 0; i < 120; i++) t.step(1, pin(player, 285, 30));
    expect(t.log).toContain('crash');
    expect(t.log).not.toContain('stun');
  });
  it('砸地留下奶潭与预警石块；石块落地砸人、挡视线，冲撞能撞碎石块', () => {
    const t = setup(9);
    const player = t.world.spawnPlayer('ai_proto', 200, 100);
    const boss = t.world.spawnEnemy('naiwa_boss', 80, 100);
    let landed = false;
    for (let i = 0; i < 60 * 14 && !landed; i++) {
      t.step(1, pin(player, 200, 100));
      landed = t.world.rocks.some((r) => r.active && r.landed);
    }
    expect(t.log).toContain('land');
    expect(t.world.zones.some((z) => z.active && z.kind === 'milk')).toBe(true);
    const rock = t.world.rocks.find((r) => r.active && r.landed)!;
    expect(rock.x).toBeGreaterThanOrEqual(BOUNDS.x);
    expect(rock.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width);
    // 落地的石块挡住视线：隔着石块的远程怪不开火（Boss 倒下会收起石块，所以让它待在角落）
    const spitter = t.world.spawnEnemy('naiwa_spitter', rock.x - 40, rock.y);
    let spitterShots = 0;
    t.bus.on('weapon:fired', (e) => e.ownerId === spitter && spitterShots++);
    t.step(90, (w) => {
      w.syncPosition(player, rock.x + 40, rock.y);
      w.syncPosition(spitter, rock.x - 40, rock.y);
      w.syncPosition(boss, 20, 20);
    });
    expect(spitterShots).toBe(0);
  });
  it('站在奶潭里移动变慢', () => {
    const t = setup(9);
    const player = t.world.spawnPlayer('ai_proto', 200, 100);
    const boss = t.world.spawnEnemy('naiwa_boss', 80, 100);
    for (let i = 0; i < 60 * 14 && !t.world.zones.some((z) => z.active && z.kind === 'milk'); i++)
      t.step(1, pin(player, 200, 100));
    const zone = t.world.zones.find((z) => z.active && z.kind === 'milk')!;
    t.input.move = { x: 1, y: 0 };
    const away = (x: number, y: number) => (w: CombatWorld) => {
      w.syncPosition(player, x, y);
      w.syncPosition(boss, 20, 20);
    };
    t.step(30, away(270, 180));
    const free = t.world.getActor(player)!.vx;
    t.step(2, away(zone.x, zone.y));
    const slowed = t.world.getActor(player)!.vx;
    expect(slowed).toBeCloseTo(free * BALANCE.milkSlow, 1);
  });
});

describe('存档', () => {
  it('招式进行中存档 → JSON → 读档，之后同样输入的结果完全一致', () => {
    const kinds: EnemyId[] = ['naiwa_hopper', 'naiwa_bomber', 'naiwa_tongue', 'naiwa_brood', 'naiwa_dancer'];
    const make = () => {
      const t = setup(21);
      t.world.spawnPlayer('ai_proto', 150, 100);
      kinds.forEach((k, i) => t.world.spawnEnemy(k, 40 + i * 50, i % 2 ? 40 : 160));
      t.world.spawnEnemy('naiwa_gasser', 260, 100);
      return t;
    };
    const a = make();
    a.step(150);
    const saved = JSON.parse(JSON.stringify(a.world.save()));
    const bus = new EventBus<GameEvents>();
    const b = createCombatWorld({ seed: 21, bus, bounds: BOUNDS });
    b.load(saved);
    const input = createInputFrame();
    for (let i = 0; i < 240; i++) {
      for (const w of [a.world, b]) {
        for (const actor of w.actors)
          if (actor.phase === 'active')
            w.syncPosition(actor.id, actor.x + actor.vx * DT, actor.y + actor.vy * DT);
        for (const s of w.step(DT, input).bulletSpawns) w.releaseBullet(s.id);
      }
    }
    expect(JSON.stringify(b.save())).toBe(JSON.stringify(a.world.save()));
  });
  it('石块与区域也随存档恢复', () => {
    const t = setup(9);
    t.world.spawnPlayer('ai_proto', 200, 100);
    t.world.spawnEnemy('naiwa_boss', 80, 100);
    for (let i = 0; i < 60 * 14 && !t.world.rocks.some((r) => r.active); i++) t.step();
    const saved = JSON.parse(JSON.stringify(t.world.save()));
    expect(saved.rocks.length).toBeGreaterThan(0);
    const w = createCombatWorld({ seed: 9, bus: new EventBus<GameEvents>(), bounds: BOUNDS });
    w.load(saved);
    expect(JSON.stringify(w.save())).toBe(JSON.stringify(saved));
  });
});
