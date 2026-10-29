import { ENEMIES } from '../../data/enemies';
import { ROOM_METRICS as M, ROOM_PORTS } from '../../data/roomTemplates/metrics';
import { ROOM_RULES } from '../../data/rooms';
import { LOOT_RULES } from '../../data/loot';
import { RoomGeometry, type Point, type GeometryObstacle } from '../geometry/RoomGeometry';
import { roomColumns, physicalContour, wallCells } from './wallGeometry';
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
  /** Grid-aligned wall bases; the physical boundary excludes their complete raised silhouette. */
  readonly artBoundary: readonly Point[];
  readonly wallCells: readonly Point[];
  readonly floorBoundary: readonly Point[];
  readonly cuts: readonly BoundaryBox[];
  readonly obstacles: readonly GeometryObstacle[];
  readonly ports: readonly {
    readonly id: string;
    readonly direction: Point;
    readonly center: Point;
    readonly artCenter?: Point;
    readonly entrance: Point;
  }[];
  readonly spawns: readonly Anchor[];
  readonly anchors: Readonly<Record<'player' | 'chest' | 'reward' | 'exit', Point>>;
}
/** Conservative visible extents include rims and the tall barrel art, not only damage cores. */
export function clearOfTraps(t: RoomTemplate, p: Point, radius: number): boolean {
  return t.traps.every((trap) => {
    const width = trap.width ?? (trap.kind === 'barrel' ? 18 : 16);
    const height = trap.height ?? (trap.kind === 'barrel' ? 23 : 16);
    const rim = trap.width ? M.rim : 0;
    // The upright barrel sprite is anchored at 0.65 of its height, above its collision center.
    const y = trap.y + (trap.kind === 'barrel' ? height * (0.5 - 0.65) : 0);
    return (
      Math.abs(p.x - M.center.x - trap.x) >= width / 2 + rim + radius ||
      Math.abs(p.y - M.center.y - y) >= height / 2 + rim + radius
    );
  });
}
/** One wall-cell plan supplies art, exact stair-step geometry and Arcade infill. */
export function compileRoom(t: RoomTemplate): CompiledRoom {
  const cx = M.center.x,
    cy = M.center.y;
  const artBoundary = t.outline.map(([x, y]) => ({ x: cx + x, y: cy + y }));
  const columns = roomColumns(artBoundary),
    boundary = physicalContour(columns);
  const floorBoundary = physicalContour(columns, 0);
  const x = Math.min(...boundary.map((p) => p.x)),
    y = Math.min(...boundary.map((p) => p.y));
  const bounds = {
    x,
    y,
    width: Math.max(...boundary.map((p) => p.x)) - x,
    height: Math.max(...boundary.map((p) => p.y)) - y,
  };
  const cuts: BoundaryBox[] = [];
  const append = (left: number, top: number, bottom: number) => {
    if (bottom <= top) return;
    const last = cuts[cuts.length - 1];
    if (
      last &&
      last.y === (top + bottom) / 2 &&
      last.height === bottom - top &&
      last.x + last.width / 2 === left
    ) {
      cuts[cuts.length - 1] = { ...last, x: last.x + M.wall.width / 2, width: last.width + M.wall.width };
    } else
      cuts.push({
        x: left + M.wall.width / 2,
        y: (top + bottom) / 2,
        width: M.wall.width,
        height: bottom - top,
      });
  };
  for (const c of columns) append(c.x, bounds.y, c.top);
  for (const c of columns) append(c.x, c.bottom - M.wall.faceHeight, bounds.y + bounds.height);
  if (cuts.length > M.maxBoundaryBodies) throw new RangeError('boundary pool exhausted');
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
      shape: { type: 'circle', x: cx + p.x, y: cy + p.y, radius: M.barrelRadius },
    }));
  const geometry = new RoomGeometry(boundary, [...obstacles, ...barrels], 0);
  const interior = new RoomGeometry(boundary, [], 0);
  for (const item of [...t.boxes, ...t.traps]) {
    const w = item.width ?? 24,
      h = item.height ?? 28;
    for (const dx of [-w / 2, w / 2])
      for (const dy of [-h / 2, h / 2])
        if (!interior.canOccupy({ x: cx + item.x + dx, y: cy + item.y + dy }, 0, 'walk'))
          throw new RangeError(`placement outside ${t.id}`);
  }
  const safe = (p: Point, radius: number) =>
    geometry.canOccupy(p, radius, 'spawn') && clearOfTraps(t, p, radius);
  const spawns: Anchor[] = [];
  for (let y = bounds.y + M.spawnMargin; y <= bounds.y + bounds.height - M.spawnMargin; y += M.spawnGrid)
    for (let x = bounds.x + M.spawnMargin; x <= bounds.x + bounds.width - M.spawnMargin; x += M.spawnGrid)
      if (safe({ x, y }, maxSpawnRadius))
        spawns.push({ id: `spawn:${String(spawns.length).padStart(3, '0')}`, x, y });
  if (!spawns.length) throw new RangeError('no safe spawn anchors');
  const middle = columns.find((c) => c.x <= cx && c.x + M.wall.width > cx)!;
  const cross = columns.filter((c) => c.top <= cy && c.bottom - M.wall.faceHeight >= cy);
  const ports = ROOM_PORTS.map((p) => {
    const dx = p.direction.x,
      dy = p.direction.y;
    const center = {
      x: dx < 0 ? cross[0]!.x : dx > 0 ? cross[cross.length - 1]!.x + M.wall.width : cx,
      y: dy < 0 ? middle.top : dy > 0 ? middle.bottom - M.wall.faceHeight : cy,
    };
    const entrance = {
      x: center.x - dx * ROOM_RULES.entranceInset,
      y: center.y - dy * ROOM_RULES.entranceInset,
    };
    if (!safe(entrance, maxSpawnRadius)) throw new RangeError(`blocked port ${t.id}/${p.id}`);
    return { ...p, center, artCenter: { x: center.x, y: dy > 0 ? middle.bottom : center.y }, entrance };
  });
  const anchor = (reward = false): Point => {
    const legal = (p: Point) =>
      safe(p, M.interactionRadius) &&
      (!reward ||
        [-1, 1].every((sign) =>
          safe({ x: p.x + sign * LOOT_RULES.rewardSpacing, y: p.y }, M.interactionRadius),
        ));
    const first = { x: cx, y: cy };
    const result = legal(first) ? first : spawns.find(legal);
    if (!result) throw new RangeError('blocked interaction anchor');
    return result;
  };
  return {
    bounds,
    boundary,
    artBoundary,
    floorBoundary,
    wallCells: wallCells(artBoundary),
    cuts,
    obstacles,
    ports,
    spawns,
    anchors: { player: anchor(), chest: anchor(), exit: anchor(), reward: anchor(true) },
  };
}
