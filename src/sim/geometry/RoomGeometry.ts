/** ADR 0039: query masks are independent; combined masks block on any selected bit. */
export const GeometryMask = { walk: 1, land: 2, LOS: 4, projectile: 8 } as const;
export type GeometryKind = 'boundary' | 'wall' | 'pillar' | 'barrel' | 'rock' | 'water';
export type OccupyPurpose = 'walk' | 'land' | 'spawn' | 'surface' | 'rock';
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface GeometryObstacle {
  readonly id: string;
  readonly kind: GeometryKind;
  readonly mask: number;
  readonly shape:
    | { readonly type: 'polygon'; readonly points: readonly Point[] }
    | { readonly type: 'circle'; readonly x: number; readonly y: number; readonly radius: number };
}
/** Caller-owned output. Position is the moving centre, normal points away from the blocker.
 * Miss: t=1, distance=path length, position=to, normal=0, kind/id=null.
 * Initial overlap: t=0, normal=0. Results remain valid until caller reuses out.
 */
export interface GeometryHit {
  hit: boolean;
  t: number;
  distance: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  kind: GeometryKind | null;
  id: string | null;
}
/** Allocate outside the combat loop. */
export function createGeometryHit(): GeometryHit {
  return { hit: false, t: 1, distance: 0, x: 0, y: 0, nx: 0, ny: 0, kind: null, id: null };
}
/** Read-only sim contract; never imports game, consumes RNG, or changes world state. */
export interface GeometryQueries {
  readonly revision: number;
  canOccupy(center: Point, radius: number, purpose: OccupyPurpose): boolean;
  sweepCircle(from: Point, to: Point, radius: number, mask: number, out: GeometryHit): void;
  traceSegment(from: Point, to: Point, mask: number, out: GeometryHit): void;
}
function distanceSq(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
function inside(p: Point, points: readonly Point[]): boolean {
  let yes = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]!,
      b = points[i]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) yes = !yes;
  }
  return yes;
}
function copyPolygon(points: readonly Point[]): readonly Point[] {
  if (points.length < 3) throw new Error('Geometry polygon needs at least three vertices');
  const copy = points.map((p) => Object.freeze({ x: p.x, y: p.y }));
  for (let i = 0; i < copy.length; i++) {
    const a = copy[i]!,
      b = copy[(i + 1) % copy.length]!;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || (a.x === b.x && a.y === b.y))
      throw new Error('Invalid geometry edge');
  }
  return Object.freeze(copy);
}
/** Immutable snapshot. The owner replaces it on room/door/barrel/rock changes and supplies
 * a strictly increasing revision across rooms (not a per-template counter). Snapshot creation
 * allocates; queries do not. Polygon inputs are compiled simple contours, no holes/self-crossing.
 * Room exterior always blocks all nonzero masks. Obstacles supply explicit masks; absent/broken
 * objects must be omitted. Circle LOS uses strict interior, matching legacy barrel/rock tangency.
 */
export class RoomGeometry implements GeometryQueries {
  readonly revision: number;
  private readonly boundary: readonly Point[];
  private readonly obstacles: readonly GeometryObstacle[];
  constructor(boundary: readonly Point[], obstacles: readonly GeometryObstacle[], revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid geometry revision');
    this.revision = revision;
    this.boundary = copyPolygon(boundary);
    const ids = new Set<string>();
    this.obstacles = Object.freeze(
      obstacles.map((o) => {
        if (
          !o.id ||
          o.id === 'boundary' ||
          ids.has(o.id) ||
          !Number.isInteger(o.mask) ||
          o.mask < 0 ||
          o.mask > 15
        )
          throw new Error('Invalid geometry identity/mask');
        ids.add(o.id);
        const s = o.shape;
        if (
          s.type === 'circle' &&
          (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.radius) || s.radius <= 0)
        )
          throw new Error('Invalid geometry circle');
        return Object.freeze({
          ...o,
          shape:
            s.type === 'polygon'
              ? Object.freeze({ type: 'polygon' as const, points: copyPolygon(s.points) })
              : Object.freeze({ ...s }),
        });
      }),
    );
    Object.freeze(this);
  }
  canOccupy(center: Point, radius: number, purpose: OccupyPurpose): boolean {
    this.validate(center, center, radius);
    const mask =
      purpose === 'walk' || purpose === 'surface'
        ? GeometryMask.walk
        : purpose === 'land'
          ? GeometryMask.land
          : GeometryMask.walk | GeometryMask.land;
    if (!inside(center, this.boundary) || this.nearEdges(center, radius, this.boundary)) return false;
    for (const o of this.obstacles) {
      if (!(o.mask & mask)) continue;
      const s = o.shape;
      if (
        s.type === 'circle'
          ? Math.hypot(center.x - s.x, center.y - s.y) <= radius + s.radius
          : inside(center, s.points) || this.nearEdges(center, radius, s.points)
      )
        return false;
    }
    return true;
  }
  traceSegment(from: Point, to: Point, mask: number, out: GeometryHit): void {
    this.sweepCircle(from, to, 0, mask, out);
  }
  sweepCircle(from: Point, to: Point, radius: number, mask: number, out: GeometryHit): void {
    this.validate(from, to, radius);
    if (!Number.isInteger(mask) || mask < 0 || mask > 15) throw new Error('Invalid query mask');
    out.hit = false;
    out.t = 1;
    out.distance = Math.hypot(to.x - from.x, to.y - from.y);
    out.x = to.x;
    out.y = to.y;
    out.nx = 0;
    out.ny = 0;
    out.kind = null;
    out.id = null;
    if (!mask) return;
    if (!inside(from, this.boundary)) this.record(0, 0, 0, 'boundary', 'boundary', out);
    this.edges(from, to, radius, this.boundary, 'boundary', 'boundary', out);
    for (const o of this.obstacles) {
      if (!(o.mask & mask)) continue;
      const s = o.shape;
      if (s.type === 'circle')
        this.circle(
          from,
          to,
          radius + s.radius,
          s.x,
          s.y,
          o.kind,
          o.id,
          out,
          radius === 0 && mask === GeometryMask.LOS,
        );
      else {
        if (inside(from, s.points)) this.record(0, 0, 0, o.kind, o.id, out);
        this.edges(from, to, radius, s.points, o.kind, o.id, out);
      }
    }
    out.distance *= out.t;
    out.x = from.x + (to.x - from.x) * out.t;
    out.y = from.y + (to.y - from.y) * out.t;
  }
  private validate(a: Point, b: Point, r: number): void {
    if (
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.y) ||
      !Number.isFinite(b.x) ||
      !Number.isFinite(b.y) ||
      !Number.isFinite(r) ||
      r < 0
    )
      throw new Error('Invalid geometry query');
  }
  private nearEdges(p: Point, r: number, points: readonly Point[]): boolean {
    for (let i = 0; i < points.length; i++)
      if (distanceSq(p, points[i]!, points[(i + 1) % points.length]!) <= r * r) return true;
    return false;
  }
  private record(t: number, nx: number, ny: number, kind: GeometryKind, id: string, out: GeometryHit): void {
    if (t < 0 || t > 1 || t > out.t) return;
    if (
      out.hit &&
      t === out.t &&
      ((out.kind === 'boundary' && kind !== 'boundary') ||
        ((out.kind === 'boundary') === (kind === 'boundary') && id >= out.id!))
    )
      return;
    out.hit = true;
    out.t = t;
    out.nx = nx;
    out.ny = ny;
    out.kind = kind;
    out.id = id;
  }
  private circle(
    a: Point,
    b: Point,
    r: number,
    x: number,
    y: number,
    kind: GeometryKind,
    id: string,
    out: GeometryHit,
    strict = false,
  ): void {
    const px = a.x - x,
      py = a.y - y,
      dx = b.x - a.x,
      dy = b.y - a.y;
    const c = px * px + py * py - r * r,
      v = dx * dx + dy * dy,
      dot = px * dx + py * dy;
    if (c < 0 || (!strict && c === 0)) {
      this.record(0, 0, 0, kind, id, out);
      return;
    }
    if (v === 0) return;
    const disc = dot * dot - v * c;
    if (disc < 0 || (strict && disc === 0)) return;
    const t = (-dot - Math.sqrt(disc)) / v;
    if (strict && t >= 1) return;
    const nx = px + dx * t,
      ny = py + dy * t,
      length = Math.hypot(nx, ny);
    this.record(t, length ? nx / length : 0, length ? ny / length : 0, kind, id, out);
  }
  private edges(
    a: Point,
    b: Point,
    r: number,
    points: readonly Point[],
    kind: GeometryKind,
    id: string,
    out: GeometryHit,
  ): void {
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!,
        q = points[(i + 1) % points.length]!;
      if (distanceSq(a, p, q) <= r * r) {
        this.record(0, 0, 0, kind, id, out);
        continue;
      }
      // Minkowski sum of a segment and a disk: finite strip plus round endcaps.
      this.circle(a, b, r, p.x, p.y, kind, id, out);
      const ex = q.x - p.x,
        ey = q.y - p.y,
        len = Math.hypot(ex, ey),
        nx = -ey / len,
        ny = ex / len;
      const start = (a.x - p.x) * nx + (a.y - p.y) * ny,
        speed = (b.x - a.x) * nx + (b.y - a.y) * ny;
      if (speed === 0) continue;
      for (let sign = -1; sign <= 1; sign += 2) {
        const t = (sign * r - start) / speed;
        const along = ((a.x + (b.x - a.x) * t - p.x) * ex + (a.y + (b.y - a.y) * t - p.y) * ey) / (len * len);
        const normalSign = r === 0 ? (speed < 0 ? 1 : -1) : sign;
        if (along >= 0 && along <= 1) this.record(t, normalSign * nx, normalSign * ny, kind, id, out);
      }
    }
  }
}
