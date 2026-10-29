import { ROOM_METRICS as M } from '../../data/roomTemplates/metrics';
import type { Point } from '../geometry/RoomGeometry';
export interface RoomColumn {
  x: number;
  top: number;
  bottom: number;
}
/** Cell-center fill for grid-aligned orthogonal/45-degree, column-connected silhouettes. */
export function roomColumns(points: readonly Point[]): RoomColumn[] {
  const step = M.wall.width;
  if (
    points.length < 4 ||
    points.some((a, i) => {
      const b = points[(i + 1) % points.length]!;
      return (
        (a.x - M.center.x) % step !== 0 ||
        (a.y - M.center.y) % step !== 0 ||
        (a.x !== b.x && a.y !== b.y && Math.abs(a.x - b.x) !== Math.abs(a.y - b.y))
      );
    })
  )
    throw new RangeError('wall contour must use the orthogonal/45-degree module grid');
  const left = Math.min(...points.map((p) => p.x)),
    right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y)),
    bottom = Math.max(...points.map((p) => p.y));
  if (
    left < M.bounds.x ||
    right > M.bounds.x + M.bounds.width ||
    top < M.bounds.y ||
    bottom > M.bounds.y + M.bounds.height
  )
    throw new RangeError('room exceeds rendering/navigation envelope');
  const inside = (x: number, y: number): boolean => {
    let yes = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!,
        b = points[j]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) yes = !yes;
    }
    return yes;
  };
  const columns: RoomColumn[] = [];
  for (let x = left; x < right; x += step) {
    const rows: number[] = [];
    for (let y = top; y < bottom; y += step) if (inside(x + step / 2, y + step / 2)) rows.push(y);
    if (!rows.length || rows.some((y, i) => i > 0 && y !== rows[i - 1]! + step))
      throw new RangeError('room columns must be connected');
    columns.push({ x, top: rows[0]!, bottom: rows[rows.length - 1]! + step });
  }
  return columns;
}
/** One outside course of complete, unrotated cuboids; diagonal neighbors advance (8,8). */
export function wallCells(points: readonly Point[]): Point[] {
  const columns = roomColumns(points),
    step = M.wall.width;
  const filled = new Set<string>();
  for (const c of columns) for (let y = c.top; y < c.bottom; y += step) filled.add(`${c.x}:${y}`);
  const outside = new Map<string, Point>();
  for (const c of columns)
    for (let y = c.top; y < c.bottom; y += step)
      for (const [dx, dy] of [
        [-step, 0],
        [step, 0],
        [0, -step],
        [0, step],
      ]) {
        const x = c.x + dx!,
          py = y + dy!,
          key = `${x}:${py}`;
        if (!filled.has(key)) outside.set(key, { x, y: py });
      }
  return [...outside.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
/** Exact staircase of drawn wall silhouettes, shared by Arcade infill and sim queries. */
export function physicalContour(
  columns: readonly RoomColumn[],
  projection: number = M.wall.faceHeight,
): Point[] {
  const points: Point[] = [],
    step = M.wall.width;
  for (const c of columns) points.push({ x: c.x, y: c.top }, { x: c.x + step, y: c.top });
  for (const c of [...columns].reverse())
    points.push({ x: c.x + step, y: c.bottom - projection }, { x: c.x, y: c.bottom - projection });
  const distinct = points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
  return distinct.filter((p, i) => {
    const a = distinct[(i + distinct.length - 1) % distinct.length]!,
      b = distinct[(i + 1) % distinct.length]!;
    return (a.x - p.x) * (p.y - b.y) !== (a.y - p.y) * (p.x - b.x);
  });
}
