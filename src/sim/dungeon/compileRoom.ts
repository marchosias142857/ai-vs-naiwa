import { ENEMIES } from '../../data/enemies';
import { LEGACY_V1 } from '../../data/roomTemplates/legacyV1';
import { MODULAR_V2 } from '../../data/roomTemplates/modularV2';
import { LOOT_RULES } from '../../data/loot';
import { RoomGeometry, type Point, type GeometryObstacle } from '../geometry/RoomGeometry';
import type { RoomTemplate } from './roomCatalog';

const maxSpawnRadius = Math.max(...Object.values(ENEMIES).map((enemy) => enemy.radius));

export interface Anchor extends Point {
  readonly id: string;
}
export interface BoundaryBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface CompiledRoom {
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly boundary: readonly Point[];
  readonly cuts: readonly BoundaryBox[];
  readonly obstacles: readonly GeometryObstacle[];
  readonly ports: readonly {
    readonly id: string;
    readonly direction: Point;
    readonly center: Point;
    readonly entrance: Point;
  }[];
  readonly spawns: readonly Anchor[];
  readonly anchors: Readonly<Record<'player' | 'chest' | 'reward' | 'exit', Point>>;
}
/** Compiles once when entering a room; the polygon and Arcade infill share one contour table. */
export function compileRoom(t: RoomTemplate): CompiledRoom {
  const origin = LEGACY_V1.bounds,
    cx = origin.x + origin.width / 2,
    cy = origin.y + origin.height / 2;
  const shape = t.id.startsWith('modular_v2/') ? MODULAR_V2.shapes[t.theme] : MODULAR_V2.shapes.milk;
  const boundary = shape.points.map(([x, y]) => ({ x: origin.x + x, y: origin.y + y }));
  const x = Math.min(...boundary.map((p) => p.x)),
    y = Math.min(...boundary.map((p) => p.y));
  const b = {
    x,
    y,
    width: Math.max(...boundary.map((p) => p.x)) - x,
    height: Math.max(...boundary.map((p) => p.y)) - y,
  };
  const cuts = shape.cuts.map(([x, y, width, height]) => ({
    x: origin.x + x + width / 2,
    y: origin.y + y + height / 2,
    width,
    height,
  }));
  if (cuts.length > MODULAR_V2.maxBoundaryBodies) throw new RangeError('boundary pool exhausted');
  const obstacles: GeometryObstacle[] = t.boxes.map((box, i) => {
    const x = cx + box.x,
      y = cy + box.y,
      w = box.width / 2,
      h = box.height / 2;
    return {
      id: `${t.obstacle}:${i}`,
      kind: t.obstacle,
      mask: t.mask,
      shape: {
        type: 'polygon',
        points: [
          { x: x - w, y: y - h },
          { x: x + w, y: y - h },
          { x: x + w, y: y + h },
          { x: x - w, y: y + h },
        ],
      },
    };
  });
  const barrels: GeometryObstacle[] = t.traps
    .filter((p) => p.kind === 'barrel')
    .map((p, i) => ({
      id: `barrel:${i}`,
      kind: 'barrel',
      mask: 15,
      shape: { type: 'circle', x: cx + p.x, y: cy + p.y, radius: LEGACY_V1.trapRadii.barrel },
    }));
  const interior = new RoomGeometry(boundary, [], 0);
  const fits = (x: number, y: number, width: number, height: number) =>
    x - width / 2 >= b.x &&
    x + width / 2 <= b.x + b.width &&
    y - height / 2 >= b.y &&
    y + height / 2 <= b.y + b.height &&
    !cuts.some(
      (cut) =>
        Math.abs(x - cut.x) < (width + cut.width) / 2 && Math.abs(y - cut.y) < (height + cut.height) / 2,
    );
  for (const box of t.boxes)
    if (!fits(cx + box.x, cy + box.y, box.width, box.height))
      throw new RangeError('obstacle outside contour');
  for (const trap of t.traps) {
    const p = { x: cx + trap.x, y: cy + trap.y };
    const radius = trap.kind === 'barrel' || trap.kind === 'mine' ? LEGACY_V1.trapRadii[trap.kind] : 0;
    if (radius ? !interior.canOccupy(p, radius, 'spawn') : !fits(p.x, p.y, trap.width ?? 0, trap.height ?? 0))
      throw new RangeError('trap outside contour');
  }
  const geometry = new RoomGeometry(boundary, [...obstacles, ...barrels], 0);
  const spawns: Anchor[] = [];
  for (
    let y = b.y + MODULAR_V2.spawnMargin;
    y <= b.y + b.height - MODULAR_V2.spawnMargin;
    y += MODULAR_V2.spawnGrid
  )
    for (
      let x = b.x + MODULAR_V2.spawnMargin;
      x <= b.x + b.width - MODULAR_V2.spawnMargin;
      x += MODULAR_V2.spawnGrid
    )
      if (geometry.canOccupy({ x, y }, maxSpawnRadius, 'spawn'))
        spawns.push({ id: `spawn:${String(spawns.length).padStart(3, '0')}`, x, y });
  if (!spawns.length) throw new RangeError('no safe spawn anchors');
  const ports = LEGACY_V1.ports.map((p) => {
    const dx = p.direction.x,
      dy = p.direction.y;
    const center = {
      x: dx ? cx + (dx * b.width) / 2 : p.id === 'north' ? origin.x + shape.northX : cx,
      y: dy ? cy + (dy * b.height) / 2 : cy,
    };
    return {
      ...p,
      center,
      entrance: {
        x: center.x - dx * LEGACY_V1.doorRules.entranceInset,
        y: center.y - dy * LEGACY_V1.doorRules.entranceInset,
      },
    };
  });
  for (const p of ports)
    if (!geometry.canOccupy(p.entrance, maxSpawnRadius, 'spawn')) throw new RangeError('blocked port');
  const safe = (point: Point, reward = false): Point => {
    const legal = (p: Point) =>
      geometry.canOccupy(p, MODULAR_V2.interactionRadius, 'spawn') &&
      (!reward ||
        [-1, 1].every((sign) =>
          geometry.canOccupy(
            { x: p.x + sign * LOOT_RULES.rewardSpacing, y: p.y },
            MODULAR_V2.interactionRadius,
            'spawn',
          ),
        ));
    if (legal(point)) return point;
    const fallback = spawns.find(legal);
    if (!fallback) throw new RangeError('blocked interaction anchor');
    return fallback;
  };
  return {
    bounds: b,
    boundary,
    cuts,
    obstacles,
    ports,
    spawns,
    anchors: {
      player: safe(LEGACY_V1.anchors.player),
      chest: safe(LEGACY_V1.anchors.chest),
      reward: safe(LEGACY_V1.anchors.reward, true),
      exit: safe(LEGACY_V1.anchors.exit),
    },
  };
}
