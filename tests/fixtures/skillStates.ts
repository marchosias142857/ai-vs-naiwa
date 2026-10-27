import { ENEMIES, type EnemyId } from '../../src/data/enemies';
import {
  createCombatWorld,
  type ActorView,
  type BulletSpawn,
  type CombatWorldState,
} from '../../src/sim/combat/api';
import { EventBus } from '../../src/sim/core/EventBus';
import type { GameEvents } from '../../src/sim/core/events';
import { createInputFrame } from '../../src/sim/core/types';

export interface SkillSample {
  state: CombatWorldState;
  id: number;
  label: string;
  bullets?: BulletSpawn[];
  events: GameEvents['enemy:acted'][];
  explosions: GameEvents['combat:exploded'][];
}
export interface SkillCase {
  name: string;
  kind: EnemyId;
  move: ActorView['move'];
  frames: (SkillSample | null)[];
}
const BOUNDS = { x: 32, y: 32, width: 416, height: 206 };
const DT = 1 / 60;

/** 用真实 AI 跑出样本；只设置初始位置/Boss 血量，不伪造阶段、进度或招式事件。 */
export function skillStates(): SkillCase[] {
  const cases: SkillCase[] = [];
  const kinds: EnemyId[] = [
    'naiwa_chaser',
    'naiwa_charger',
    'naiwa_hopper',
    'naiwa_bomber',
    'naiwa_tongue',
    'naiwa_brood',
    'naiwa_spitter',
    'naiwa_turret',
    'naiwa_burrower',
    'naiwa_dancer',
    'naiwa_gasser',
    'naiwa_boss',
  ];
  for (const kind of kinds) {
    const moves: ActorView['move'][] =
      kind === 'naiwa_boss'
        ? ['bump', 'hop', 'summon', 'rain', 'spin', 'none']
        : kind === 'naiwa_chaser' || kind === 'naiwa_charger'
          ? ['dash']
          : kind === 'naiwa_hopper'
            ? ['hop']
            : kind === 'naiwa_bomber'
              ? ['fuse']
              : kind === 'naiwa_tongue'
                ? ['lash']
                : kind === 'naiwa_brood'
                  ? ['summon']
                  : kind === 'naiwa_burrower'
                    ? ['burrow']
                    : kind === 'naiwa_dancer'
                      ? ['spin']
                      : ['none'];
    const rows = moves.map(
      (move) =>
        ({ name: `${kind}/${move}`, kind, move, frames: [null, null, null, null, null] }) as SkillCase,
    );
    const bus = new EventBus<GameEvents>();
    let world = createCombatWorld({ seed: 8, bus, bounds: BOUNDS, godMode: true });
    world.spawnPlayer('ai_proto', 260, 130);
    const id = world.spawnEnemy(kind, kind === 'naiwa_bomber' ? 245 : 170, 130);
    if (kind === 'naiwa_boss') {
      const initial = world.save();
      initial.actors.find((a) => a.id === id)!.hp = Math.floor(ENEMIES.naiwa_boss.hp * 0.3);
      world = createCombatWorld({ seed: 8, bus, bounds: BOUNDS, godMode: true });
      world.load(initial);
    }
    let events: GameEvents['enemy:acted'][] = [],
      explosions: GameEvents['combat:exploded'][] = [];
    bus.on('enemy:acted', (e) => events.push({ ...e }));
    bus.on('combat:exploded', (e) => explosions.push({ ...e }));
    const input = createInputFrame();
    let bullets: BulletSpawn[] = [];
    const sample = (label: string): SkillSample => ({
      state: world.save(),
      bullets: structuredClone(bullets),
      id,
      label,
      events: [...events],
      explosions: [...explosions],
    });
    for (let i = 0; i < 60 * (kind === 'naiwa_boss' ? 100 : 18); i++) {
      events = [];
      explosions = [];
      for (const a of world.actors) {
        if (a.phase !== 'active') continue;
        world.syncPosition(
          a.id,
          a.team === 'player' ? 260 : Math.max(32 + a.radius, Math.min(448 - a.radius, a.x + a.vx * DT)),
          a.team === 'player' ? 130 : Math.max(32 + a.radius, Math.min(238 - a.radius, a.y + a.vy * DT)),
        );
      }
      const result = world.step(DT, input);
      bullets = result.bulletSpawns.map((b) => ({ ...b }));
      const a = world.getActor(id)!;
      for (const row of rows) {
        const f = row.frames;
        if (kind === 'naiwa_gasser') {
          if (!f[3] && events.some((e) => e.id === id && e.action === 'gas'))
            f[3] = sample('放毒事件（无前摇/收招）');
          continue;
        }
        const own = a.move === row.move;
        const windup =
          a.phase === 'active' &&
          own &&
          (a.stage === 'windup' || (row.move === 'burrow' && a.stage === 'emerge'));
        if (windup && row.move === 'none' && !f[0]) f[3] = null;
        if (windup && !f[3]) {
          f[0] ??= sample('前摇首步');
          if (a.aimLocked) f[1] ??= sample('方向锁定');
          f[2] = sample('前摇末步');
        }
        if (own && row.move === 'burrow' && a.stage === 'buried') f[1] ??= sample('地下（无方向锁定）');
        if (own && row.move === 'hop' && a.stage === 'air') f[1] ??= sample('起跳锁定 / 落点');
        const activation =
          (own && (a.stage === 'active' || a.stage === 'dash' || a.stage === 'spin')) ||
          (row.move === 'hop' && events.some((e) => e.id === id && e.action === 'land')) ||
          (row.move === 'rain' && events.some((e) => e.id === id && e.action === 'rain')) ||
          (row.move === 'fuse' && explosions.length > 0);
        if (activation && !f[3]) f[3] = sample('生效首步');
        if (
          f[3] &&
          own &&
          ((a.stage === 'recover' && a.stageTime > a.stageSpan * 0.5) ||
            (row.move === 'burrow' && a.stage === 'active' && a.stageTime > 0.3))
        )
          f[4] ??= sample('收招 / 地面停留');
        if (own && a.stage === 'spin' && a.stageTime > a.stageSpan * 0.8) f[2] ??= sample('旋转中（无前摇）');
      }
      // 不积压弹体，但不改开火、AI、随机或事件；落石/区域仍由 sim 正常推进。
      for (const b of result.bulletSpawns) world.releaseBullet(b.id);
      if (a.phase === 'dead') break;
    }
    cases.push(...rows);
  }
  const bump = cases.find((c) => c.name === 'naiwa_boss/bump')!;
  const dash = bump.frames[3]!;
  const stunned = createCombatWorld({
    seed: 8,
    bus: new EventBus<GameEvents>(),
    bounds: BOUNDS,
    godMode: true,
  });
  stunned.load(dash.state);
  for (let i = 0; i < 60 && stunned.getActor(dash.id)!.stage !== 'stun'; i++)
    stunned.step(DT, createInputFrame());
  cases.push({
    ...bump,
    name: 'naiwa_boss/bump_stun',
    frames: [
      ...bump.frames.slice(0, 4),
      { ...dash, state: stunned.save(), label: '撞柱眩晕首步', events: [], explosions: [] },
    ],
  });
  const rain = cases.find((c) => c.name === 'naiwa_boss/rain')!.frames[3]!;
  const rocks = createCombatWorld({
    seed: 8,
    bus: new EventBus<GameEvents>(),
    bounds: BOUNDS,
    godMode: true,
  });
  rocks.load(rain.state);
  const rockFrames: (SkillSample | null)[] = [
    { ...rain, label: '落石首步 t=0', events: [] },
    null,
    null,
    null,
    null,
  ];
  for (let i = 0; i < 60 * 12; i++) {
    const r = rocks.rocks.find((r) => r.active);
    if (!r) break;
    const frame = (label: string): SkillSample => ({
      ...rain,
      state: rocks.save(),
      label,
      events: [],
      explosions: [],
    });
    if (!r.landed) rockFrames[2] = frame('落地前末步');
    else {
      rockFrames[3] ??= frame('落地首步 / 障碍');
      if (r.time < 0.25) {
        rockFrames[4] = frame('崩解');
        break;
      }
    }
    rocks.step(DT, createInputFrame());
  }
  cases.push({ name: 'falling_rocks', kind: 'naiwa_boss', move: 'rain', frames: rockFrames });
  return cases;
}
