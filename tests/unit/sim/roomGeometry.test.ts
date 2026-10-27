import { expect, it } from 'vitest';
import {
  RoomGeometry,
  CONTACT_EPSILON,
  GeometryMask as M,
  createGeometryHit,
  type GeometryObstacle,
} from '../../../src/sim/geometry/RoomGeometry';
import { createCombatWorld } from '../../../src/sim/combat/api';
import { EventBus } from '../../../src/sim/core/EventBus';
import { TRAP_RULES } from '../../../src/data/traps';
import { segmentHitsBox } from '../../../src/sim/dungeon/geometry';
const p = (x: number, y: number) => ({ x, y });
const rect = (l: number, t: number, r: number, b: number) => [p(l, t), p(r, t), p(r, b), p(l, b)];
const bounds = rect(0, 0, 100, 100);
const box = (
  id: string,
  kind: GeometryObstacle['kind'],
  l: number,
  t: number,
  r: number,
  b: number,
  mask = 15,
): GeometryObstacle => ({ id, kind, mask, shape: { type: 'polygon', points: rect(l, t, r, b) } });
it('full footprint rejects diagonal corner overlap missed by centre/cross checks', () => {
  const g = new RoomGeometry(bounds, [box('p', 'pillar', 50, 50, 60, 60)], 1);
  expect(g.canOccupy(p(46, 46), 5, 'walk')).toBe(true);
  expect(g.canOccupy(p(46, 46), 6, 'walk')).toBe(false);
  expect(g.canOccupy(p(4, 20), 5, 'land')).toBe(false);
});
it('concave notch: legal endpoints do not imply legal full path', () => {
  const g = new RoomGeometry(
    [p(0, 0), p(40, 0), p(40, 40), p(60, 40), p(60, 0), p(100, 0), p(100, 100), p(0, 100)],
    [],
    2,
  );
  const out = createGeometryHit();
  expect(g.canOccupy(p(20, 20), 5, 'walk')).toBe(true);
  expect(g.canOccupy(p(80, 20), 5, 'walk')).toBe(true);
  g.sweepCircle(p(20, 20), p(80, 20), 5, M.walk | M.land, out);
  expect(out).toMatchObject({ hit: true, kind: 'boundary', x: 35, y: 20, distance: 15, nx: -1 });
  g.traceSegment(p(20, 20), p(80, 20), M.LOS, out);
  expect(out.x).toBe(40);
  g.sweepCircle(p(20, 60), p(80, 60), 5, M.walk, out);
  expect(out.hit).toBe(false);
});
it('L corner has exact round capsule contact rather than expanded square', () => {
  const g = new RoomGeometry([p(0, 0), p(50, 0), p(50, 50), p(100, 50), p(100, 100), p(0, 100)], [], 3);
  const out = createGeometryHit();
  g.sweepCircle(p(30, 70), p(70, 30), 5, M.walk, out);
  expect(out.distance).toBeCloseTo(Math.sqrt(800) - 5);
  expect(Math.hypot(out.nx, out.ny)).toBeCloseTo(1);
  expect(g.canOccupy(p(out.x + out.nx * 0.01, out.y + out.ny * 0.01), 5, 'walk')).toBe(true);
});
it('first blocker wins; exact ties prefer boundary then stable ID independent of order', () => {
  const out = createGeometryHit();
  const a = box('a', 'wall', 50, 20, 60, 80),
    z = box('z', 'pillar', 50, 20, 60, 80);
  for (const obs of [
    [a, z],
    [z, a],
  ]) {
    new RoomGeometry(bounds, obs, 1).sweepCircle(p(20, 50), p(95, 50), 5, M.walk, out);
    expect(out.id).toBe('a');
    expect(out.distance).toBe(25);
  }
  new RoomGeometry(bounds, [box('a', 'pillar', 100, 20, 110, 80)], 1).sweepCircle(
    p(20, 50),
    p(110, 50),
    5,
    M.walk,
    out,
  );
  expect(out.kind).toBe('boundary');
});
it('independent masks and reserved water semantics; decoration mask zero', () => {
  const out = createGeometryHit();
  for (const mask of [M.walk, M.land, M.LOS, M.projectile]) {
    const g = new RoomGeometry(bounds, [box('a', 'wall', 40, 20, 60, 80, mask)], 1);
    for (const query of [M.walk, M.land, M.LOS, M.projectile]) {
      g.traceSegment(p(20, 50), p(80, 50), query, out);
      expect(out.hit).toBe(query === mask);
    }
  }
  const g = new RoomGeometry(
    bounds,
    [box('pool', 'water', 40, 20, 60, 80, M.walk | M.land), box('decor', 'wall', 10, 10, 90, 90, 0)],
    1,
  );
  for (const purpose of ['walk', 'land', 'spawn', 'surface', 'rock'] as const)
    expect(g.canOccupy(p(50, 50), 2, purpose)).toBe(false);
  for (const mask of [M.LOS, M.projectile]) {
    g.traceSegment(p(20, 50), p(80, 50), mask, out);
    expect(out.hit).toBe(false);
  }
});
it('zero length, overlap, outside, endpoint contact and miss reset caller output', () => {
  const g = new RoomGeometry(bounds, [], 1),
    out = createGeometryHit();
  g.sweepCircle(p(-10, 50), p(50, 50), 2, M.walk, out);
  expect(out).toMatchObject({ hit: true, t: 0, nx: 1, ny: 0 });
  g.sweepCircle(p(50, 50), p(50, 50), 2, M.walk, out);
  expect(out).toMatchObject({ hit: false, t: 1, distance: 0, id: null, kind: null, nx: 0, ny: 0 });
  g.sweepCircle(p(50, 50), p(98, 50), 2, M.walk, out);
  expect(out).toMatchObject({ hit: true, t: 1, x: 98, nx: -1 });
});
it('immutable snapshots, independent results, new revisions for removal; invalid values rejected', () => {
  const source = rect(0, 0, 100, 100),
    obs = [box('a', 'wall', 40, 20, 60, 80)];
  const g = new RoomGeometry(source, obs, 10),
    out = createGeometryHit(),
    other = createGeometryHit();
  source[0]!.x = 99;
  obs.length = 0;
  g.traceSegment(p(20, 50), p(80, 50), M.LOS, out);
  const saved = { ...out };
  g.traceSegment(p(20, 10), p(80, 10), M.LOS, other);
  expect(out).toEqual(saved);
  const next = new RoomGeometry(bounds, [], 11);
  next.traceSegment(p(20, 50), p(80, 50), M.LOS, other);
  expect(other.hit).toBe(false);
  expect(g.revision).toBe(10);
  expect(next.revision).toBe(11);
  expect(() => g.canOccupy(p(NaN, 0), 1, 'walk')).toThrow();
  expect(() => g.sweepCircle(p(1, 1), p(2, 2), -1, 1, out)).toThrow();
  expect(
    () => new RoomGeometry(bounds, [box('a', 'wall', 1, 1, 2, 2), box('a', 'wall', 2, 2, 3, 3)], 1),
  ).toThrow();
});
it('LOS equals actual CombatWorld.los for standing/broken barrels, including tangencies and endpoints', () => {
  const world = createCombatWorld({ seed: 9, bus: new EventBus() });
  const radius = TRAP_RULES.barrel.radius;
  world.setTraps(1, [{ kind: 'barrel', x: 50, y: 50, radius, width: 0, height: 0, angle: 0, delay: 0 }]);
  // Test-only access to the real legacy implementation; no production API/call-site changes.
  const legacy = world as unknown as { los(x1: number, y1: number, x2: number, y2: number): boolean };
  for (const standing of [true, false]) {
    if (!standing) world.setTraps(2, []);
    const g = new RoomGeometry(
      bounds,
      standing
        ? [{ id: 'barrel:0', kind: 'barrel', mask: 15, shape: { type: 'circle', x: 50, y: 50, radius } }]
        : [],
      1,
    );
    const out = createGeometryHit();
    for (const y of [50, 50 - radius, 50 - radius - 0.01, 50 - radius + 0.01, 70])
      for (const [x1, x2] of [
        [20, 80],
        [80, 20],
        [50, 50],
        [20, 50 - radius],
        [50 - radius, 20],
        [50 - radius, 80],
      ]) {
        g.traceSegment(p(x1!, y), p(x2!, y), M.LOS, out);
        expect(!out.hit, `${standing}/${x1}/${x2}/${y}`).toBe(legacy.los(x1!, y, x2!, y));
      }
  }
});
it('trace normals oppose entry in both directions and polygon windings', () => {
  for (const points of [bounds, [...bounds].reverse()]) {
    const g = new RoomGeometry(points, [box('wall', 'wall', 40, 20, 60, 80)], 1),
      out = createGeometryHit();
    g.traceSegment(p(20, 50), p(80, 50), M.LOS, out);
    expect(out.nx).toBe(-1);
    g.traceSegment(p(80, 50), p(20, 50), M.LOS, out);
    expect(out.nx).toBe(1);
  }
});
it('continuous sweep agrees with independent dense circle sampling across many notch paths', () => {
  const contour = [p(0, 0), p(40, 0), p(40, 40), p(60, 40), p(60, 0), p(100, 0), p(100, 100), p(0, 100)];
  const g = new RoomGeometry(contour, [box('pillar', 'pillar', 70, 65, 80, 75)], 1),
    out = createGeometryHit();
  for (let x = 10; x <= 90; x += 20)
    for (let y = 10; y <= 90; y += 20) {
      const a = p(x, y);
      if (!g.canOccupy(a, 3, 'walk')) continue;
      for (let tx = 10; tx <= 90; tx += 20)
        for (let ty = 10; ty <= 90; ty += 20) {
          const b = p(tx, ty);
          g.sweepCircle(a, b, 3, M.walk, out);
          for (let step = 0; step <= 100; step++) {
            const t = step / 100;
            if (t < out.t - 1e-9)
              expect(g.canOccupy(p(x + (tx - x) * t, y + (ty - y) * t), 3, 'walk')).toBe(true);
          }
          if (out.hit && out.t > 0) {
            // Contact must be on an edge/circle footprint, not merely a false broadphase hit.
            expect(g.canOccupy(p(out.x, out.y), 3 + CONTACT_EPSILON * 2, 'walk')).toBe(false);
          }
        }
    }
});

const contactCases = [
  { name: 'boundary', obstacles: [], x: 6, nx: 1 },
  { name: 'pillar', obstacles: [box('pillar', 'pillar', 50, 40, 60, 60)], x: 44, nx: -1 },
  {
    name: 'circle',
    obstacles: [{ id: 'rock', kind: 'rock', mask: 15, shape: { type: 'circle', x: 50, y: 50, radius: 10 } }],
    x: 34,
    nx: -1,
  },
] satisfies { name: string; obstacles: GeometryObstacle[]; x: number; nx: number }[];
it.each(contactCases)(
  '$name: touching / 0.01 penetration / epsilon gap allow departure and sliding, block entry',
  ({ obstacles, x, nx }) => {
    for (const reverse of [false, true]) {
      const contour = reverse ? [...bounds].reverse() : bounds;
      const obs = obstacles.map((o) =>
        o.shape.type === 'polygon' && reverse
          ? { ...o, shape: { ...o.shape, points: [...o.shape.points].reverse() } }
          : o,
      );
      const g = new RoomGeometry(contour, obs, 1),
        out = createGeometryHit();
      for (const penetration of [0, 0.01, -CONTACT_EPSILON / 2]) {
        const from = p(x - nx * penetration, 50);
        for (const purpose of ['walk', 'surface', 'land', 'spawn', 'rock'] as const)
          expect(g.canOccupy(from, 6, purpose)).toBe(true);
        for (const to of [p(from.x + nx * 20, 50), p(from.x, 80), from]) {
          g.sweepCircle(from, to, 6, M.walk | M.land, out);
          expect(out.hit, `${reverse}/${penetration}/${to.x}/${to.y}`).toBe(false);
        }
        g.sweepCircle(from, p(from.x - nx * 20, 50), 6, M.walk, out);
        expect(out).toMatchObject({ hit: true, t: 0, nx, ny: 0 });
        expect(Math.hypot(out.nx, out.ny)).toBeCloseTo(1);
      }
      expect(g.canOccupy(p(x - nx * (CONTACT_EPSILON + 0.001), 50), 6, 'walk')).toBe(false);
      // Outside the tolerance band, entry is a positive TOI, never an inflated collider.
      g.sweepCircle(p(x + nx * CONTACT_EPSILON * 2, 50), p(x - nx, 50), 6, M.walk, out);
      expect(out.t).toBeGreaterThan(0);
      expect(out.x).toBeCloseTo(x);
      g.sweepCircle(p(x + nx * 10, 50), p(x, 50), 6, M.walk, out);
      expect(out).toMatchObject({ hit: true, t: 1, nx, ny: 0 });
      // Invalid starts cannot silently tunnel out, even on a zero-length query.
      for (const to of [p(x + nx * 20, 50), p(x - nx * 1.01, 50)]) {
        g.sweepCircle(p(x - nx * 1.01, 50), to, 6, M.walk, out);
        expect(out).toMatchObject({ hit: true, t: 0, nx, ny: 0 });
      }
    }
  },
);
it('Boss sliding against the outer wall hits the wall-adjacent pillar first', () => {
  const g = new RoomGeometry(rect(0, 0, 200, 100), [box('pillar', 'pillar', 100, 0, 120, 40)], 1);
  const out = createGeometryHit();
  for (const y of [14, 13.99, 14.5]) {
    g.sweepCircle(p(20, y), p(120, y), 14, M.walk, out);
    expect(out).toMatchObject({ hit: true, kind: 'pillar', x: 86, nx: -1, ny: 0 });
    expect(out.t).toBeCloseTo(0.66);
  }
});
it('initial shallow contact does not suppress later entry into the same concave contour', () => {
  const contour = [p(0, 0), p(40, 0), p(40, 40), p(60, 40), p(60, 0), p(100, 0), p(100, 100), p(0, 100)];
  const obstacle = {
    id: 'wall',
    kind: 'wall',
    mask: 15,
    shape: {
      type: 'polygon',
      points: [p(20, 20), p(80, 20), p(80, 80), p(60, 80), p(60, 40), p(40, 40), p(40, 80), p(20, 80)],
    },
  } satisfies GeometryObstacle;
  const out = createGeometryHit();
  new RoomGeometry(contour, [], 1).sweepCircle(p(5.99, 20), p(80, 20), 6, M.walk, out);
  expect(out).toMatchObject({ hit: true, x: 34, kind: 'boundary', nx: -1 });
  new RoomGeometry(bounds, [obstacle], 1).sweepCircle(p(45.99, 60), p(70, 60), 6, M.walk, out);
  expect(out).toMatchObject({ hit: true, x: 54, id: 'wall', nx: -1 });
});
it('zero-radius vertices return unit normals opposing travel, including both polygon windings', () => {
  const out = createGeometryHit();
  for (const reverse of [false, true]) {
    const wall = box('wall', 'wall', 40, 40, 60, 60);
    const obs =
      wall.shape.type === 'polygon' && reverse
        ? { ...wall, shape: { ...wall.shape, points: [...wall.shape.points].reverse() } }
        : wall;
    const g = new RoomGeometry(bounds, [obs], 1);
    for (const [from, to] of [
      [p(20, 40), p(80, 40)],
      [p(80, 60), p(20, 60)],
      [p(20, 20), p(50, 50)],
    ]) {
      g.traceSegment(from!, to!, M.projectile, out);
      expect(out.hit).toBe(true);
      expect(Math.hypot(out.nx, out.ny)).toBeCloseTo(1);
      expect((to!.x - from!.x) * out.nx + (to!.y - from!.y) * out.ny).toBeLessThan(0);
    }
  }
});
it('outside rooms and deeply embedded polygon/circle centres report separating normals', () => {
  const out = createGeometryHit();
  new RoomGeometry(bounds, [], 1).sweepCircle(p(-0.001, 50), p(20, 50), 0, M.walk, out);
  expect(out).toMatchObject({ hit: true, t: 0, nx: 1, ny: 0 });
  for (const obstacle of contactCases.slice(1)) {
    const g = new RoomGeometry(bounds, obstacle.obstacles, 1);
    g.sweepCircle(p(50, 50), p(20, 50), 6, M.walk, out);
    expect(out).toMatchObject({ hit: true, t: 0 });
    expect(Math.hypot(out.nx, out.ny)).toBeCloseTo(1);
  }
});

it('pure LOS retains legacy closed-polygon contact without the body epsilon band', () => {
  const world = createCombatWorld({
    seed: 9,
    bus: new EventBus(),
    lineOfSight: (x1, y1, x2, y2) => !segmentHitsBox(x1, y1, x2, y2, 40, 40, 60, 60),
  });
  const legacy = world as unknown as { los(x1: number, y1: number, x2: number, y2: number): boolean };
  const g = new RoomGeometry(bounds, [box('wall', 'wall', 40, 40, 60, 60)], 1),
    out = createGeometryHit();
  const starts = [p(40, 40), p(40, 50), p(60, 60), p(39.99, 40), p(39.99, 39.99), p(40.01, 50), p(50, 50)];
  for (const from of starts)
    for (const to of [...starts, p(20, 40), p(80, 40), p(20, 20), p(80, 80)]) {
      g.traceSegment(from, to, M.LOS, out);
      expect(!out.hit, `${from.x}/${from.y} -> ${to.x}/${to.y}`).toBe(legacy.los(from.x, from.y, to.x, to.y));
      if (out.hit) expect(Math.hypot(out.nx, out.ny)).toBeCloseTo(1);
    }
  g.traceSegment(p(39.99, 40), p(50, 40), M.LOS, out);
  expect(out.t).toBeGreaterThan(0);
  expect(out.x).toBeCloseTo(40);
});
it('rounded polygon corners share the contact tolerance and separate along a unit radial normal', () => {
  const g = new RoomGeometry(bounds, [box('pillar', 'pillar', 50, 50, 60, 60)], 1),
    out = createGeometryHit();
  const n = -Math.SQRT1_2;
  for (const penetration of [0, 0.01]) {
    const from = p(50 + n * (6 - penetration), 50 + n * (6 - penetration));
    expect(g.canOccupy(from, 6, 'walk')).toBe(true);
    g.sweepCircle(from, p(from.x - 10, from.y - 10), 6, M.walk, out);
    expect(out.hit).toBe(false);
    g.sweepCircle(from, p(from.x - 2, from.y + 2), 6, M.walk, out);
    expect(out.hit).toBe(false);
    g.sweepCircle(from, p(from.x + 10, from.y + 10), 6, M.walk, out);
    expect(out).toMatchObject({ hit: true, t: 0 });
    expect(out.nx).toBeCloseTo(n);
    expect(out.ny).toBeCloseTo(n);
  }
});
it('boundary-class locked doors are solid obstacles, with boundary tie priority', () => {
  const out = createGeometryHit();
  const g = new RoomGeometry(
    bounds,
    [box('pillar', 'pillar', 40, 20, 60, 80), box('door', 'boundary', 40, 20, 60, 80)],
    1,
  );
  g.sweepCircle(p(20, 50), p(80, 50), 6, M.walk, out);
  expect(out).toMatchObject({ hit: true, x: 34, kind: 'boundary', id: 'door', nx: -1 });
  g.sweepCircle(p(34, 50), p(20, 50), 6, M.walk, out);
  expect(out.hit).toBe(false);
  g.sweepCircle(p(50, 50), p(20, 50), 6, M.walk, out);
  expect(out).toMatchObject({ hit: true, t: 0, id: 'door' });
});

it('future tangency from free space and endpoint contact keep closed sweep semantics', () => {
  const out = createGeometryHit();
  for (const obstacles of [contactCases[2]!.obstacles, [box('pillar', 'pillar', 50, 40, 60, 60)]]) {
    const g = new RoomGeometry(bounds, obstacles, 1);
    g.sweepCircle(p(20, 34), p(50, 34), 6, M.walk, out);
    expect(out).toMatchObject({ hit: true, t: 1, x: 50, y: 34 });
    expect(Math.hypot(out.nx, out.ny)).toBeCloseTo(1);
  }
});
