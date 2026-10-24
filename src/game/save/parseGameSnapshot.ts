import { POOL_SIZES } from '../../config';
import { ATTACKS } from '../../data/attacks';
import { WEAPONS } from '../../data/weapons';
import type { SimSnapshot } from '../../sim/run/snapshot';
import type { BodySnapshot } from '../world/bodySnapshot';
import type { GameSnapshot } from './RunSnapshot';

export const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
function body(v: unknown): v is BodySnapshot & { id: number } {
  return (
    object(v) &&
    id(v.id) &&
    ['x', 'y', 'vx', 'vy', 'radius', 'imageX', 'imageY'].every((key) => finite(v[key])) &&
    Number(v.radius) > 0
  );
}

/** game 按字段检查并交叉核对已由 sim 校验的状态；合法负坐标 / 速度不夹取。 */
export function parseGameSnapshot(value: unknown, sim: Readonly<SimSnapshot>): GameSnapshot | null {
  if (
    !object(value) ||
    !finite(value.endTime) ||
    value.endTime < 0 ||
    !object(value.physics) ||
    !Array.isArray(value.deaths)
  )
    return null;
  const p = value.physics;
  if (
    !Array.isArray(p.actors) ||
    p.actors.length !== POOL_SIZES.actors ||
    !object(p.bullets) ||
    !Array.isArray(p.bullets.slots) ||
    p.bullets.slots.length !== POOL_SIZES.bullets ||
    !Array.isArray(p.bullets.free) ||
    p.bullets.free.length > POOL_SIZES.bullets
  )
    return null;
  const actors = new Map(sim.world.actors.map((a) => [a.id, a]));
  const bullets = new Map(sim.world.bullets.map((b) => [b.id, b]));
  const actorIds = new Set<number>(),
    bulletIds = new Set<number>();
  for (const s of p.actors) {
    if (s === null) continue;
    if (!body(s) || actorIds.has(s.id) || actors.get(s.id)?.radius !== s.radius) return null;
    actorIds.add(s.id);
  }
  if (actorIds.size !== actors.size) return null;
  const empty = new Set<number>();
  for (let i = 0; i < p.bullets.slots.length; i++) {
    const s: unknown = p.bullets.slots[i];
    if (s === null) {
      empty.add(i);
      continue;
    }
    if (!body(s) || !object(s) || !finite(s.remaining) || s.remaining <= 0 || bulletIds.has(s.id))
      return null;
    const b = bullets.get(s.id);
    if (!b) return null;
    const source =
      b.team === 'player'
        ? WEAPONS[b.source as keyof typeof WEAPONS]
        : ATTACKS[b.source as keyof typeof ATTACKS];
    if (!source || s.radius !== source.bulletRadius) return null;
    bulletIds.add(s.id);
  }
  if (bulletIds.size !== bullets.size || p.bullets.free.length !== empty.size) return null;
  for (const i of p.bullets.free) {
    if (typeof i !== 'number' || !Number.isInteger(i) || !empty.delete(i)) return null;
  }
  if (empty.size || value.deaths.length > actors.size) return null;
  const dead = new Set(sim.world.actors.filter((a) => a.phase === 'dead').map((a) => a.id));
  for (const d of value.deaths) {
    if (!object(d) || !id(d.id) || !finite(d.elapsed) || d.elapsed < 0 || !dead.delete(d.id)) return null;
  }
  if (dead.size) return null;
  // 所有传给物理与死亡计时的字段均已检查；不修补或重排快照。
  return value as unknown as GameSnapshot;
}
